import { BaseRoom, Logger } from "./BaseRoom";
import {
  CLIENT_ACTION,
  GameEndPayload,
  PlayHandPayload,
  ReadyPayload,
  RoundEndPayload,
  SERVER_ACTION,
  isPlayHandPayload,
  isReadyPayload,
} from "../shared/action";
import { Client, updateLobby } from "@colyseus/core";
import { DEFAULT_BUDGET, MAX_PLAYERS } from "../shared/constants";
import { GameStateImpl, PlayerStateImpl } from "./schemes";
import { checkPayload, shuffleArrayInPlace } from "./util";
import { generateAllTiles, isStartingTile } from "../shared/tile";
import { getPenalty, getTilesPerPlayer, getTopNumber } from "../shared/utils";

import { ErrorCode } from "../shared/error";
import { StateView } from "@colyseus/schema";
import { getHand } from "../shared/hand";

export class GameRoom extends BaseRoom<GameStateImpl> {
  maxClients = MAX_PLAYERS;
  state = new GameStateImpl();

  get roomName() {
    return "my_room";
  }

  onCreateWithLogger(logger: Logger, options: any) {
    this.onMessageWithLogger<ReadyPayload>(
      CLIENT_ACTION.READY,
      (logger, client, isReady) => {
        if (this.state.status !== "waiting") {
          logger.error(
            `Game is ${this.state.status}. Cannot change readiness.`
          );
          client.error(ErrorCode.GAME_STARTED);
          return;
        }

        const player = this.findPlayer(logger, client);
        if (!player) return;

        logger.info(`Player ${player.id} ready = ${isReady}.`);
        player.isReady = isReady;
      },
      checkPayload(isReadyPayload)
    );

    this.onMessageWithLogger(CLIENT_ACTION.START, async (logger, client) => {
      if (this.state.status !== "waiting") {
        logger.error(`Game is ${this.state.status}. Ignoring start request.`);
        return;
      }

      const player = this.findPlayer(logger, client);
      if (!player) return;

      logger.info(`Starting game by player ${player.id}...`);
      if (!this.canStartGame(logger, client)) return;

      // lock the room
      logger.info(`Locking room ${this.roomId} for game start...`);
      this.state.status = "starting";
      await this.lock();

      if (!this.canStartGame(logger, client)) {
        this.state.status = "waiting";
        await this.unlock();
        return;
      }

      this.state.players.forEach((player) => {
        player.budget = DEFAULT_BUDGET;
      });
      this.startRound();
      logger.info(`Started game by player ${player.id}`);
    });

    this.onMessageWithLogger<PlayHandPayload>(
      CLIENT_ACTION.PLAY_HAND,
      (logger, client, payload) => {
        if (this.state.status !== "ongoing") {
          logger.error(`Game is ${this.state.status}. Cannot perform actions.`);
          client.error(ErrorCode.GAME_NOT_STARTED);
          return undefined;
        }

        const player = this.findPlayer(logger, client, true);
        if (!player) return;

        const topNumber = getTopNumber(this.state.players.length);
        const hand = getHand(payload, topNumber);
      },
      checkPayload(isPlayHandPayload)
    );

    this.onMessageWithLogger(CLIENT_ACTION.PASS, (logger, client) => {});

    this.onMessageWithLogger("*", (logger, client) => {
      logger.error(`Unknown action received from ${client.sessionId}`);
      client.error(ErrorCode.INVALID_ACTION);
    });

    updateLobby(this);
  }

  onJoinWithLogger(logger: Logger, client: Client, options: any) {
    if (this.findPlayer(logger, client) !== undefined) {
      logger.warn(`Player ${client.sessionId} already exists in the room.`);
      return;
    }

    logger.info(`Registering player ${client.sessionId}...`);
    const player = new PlayerStateImpl();
    player.id = client.sessionId;
    player.name = options.name || `Player ${this.state.players.length + 1}`;
    this.state.players.push(player);

    client.view = new StateView();
  }

  async onLeaveWithLogger(logger: Logger, client: Client, consented: boolean) {
    const playerIndex = this.state.players.findIndex(
      (player) => player.id === client.sessionId
    );

    if (playerIndex === -1) {
      logger.warn(`Player ${client.sessionId} not found in the room.`);
      return;
    }

    const player = this.state.players[playerIndex];
    if (this.state.status !== "waiting" && !consented) {
      logger.info(`Waiting for reconnection of player ${client.sessionId}...`);
      player.disconnected = true;

      try {
        await this.allowReconnection(client, 30);
        logger.info(`Player ${client.sessionId} reconnected successfully.`);
        player.disconnected = false;
        return;
      } catch (error) {
        logger.info(`Player ${client.sessionId} failed to reconnect.`);
      }
    }

    if (this.state.status === "ongoing") {
      logger.info(
        `Player ${client.sessionId} left during the game. Ending the game...`
      );
      this.finishGame();
    }

    this.state.players.splice(playerIndex, 1);
  }

  onDisposeWithLogger(logger: Logger) {}

  private findPlayer(
    logger: Logger,
    client: Client,
    checkIsCurrent: boolean = false
  ): PlayerStateImpl | undefined {
    const playerIndex = this.state.players.findIndex(
      (player) => player.id === client.sessionId
    );
    if (playerIndex === -1) {
      logger.error(`Player ${client.sessionId} not found.`);
      client.error(ErrorCode.NOT_PARTICIPANT);
      return undefined;
    }

    if (checkIsCurrent && this.state.currentPlayerIndex !== playerIndex) {
      logger.error(`Player ${client.sessionId} tried to play out of turn.`);
      client.error(ErrorCode.NOT_YOUR_TURN);
      return undefined;
    }

    logger.info(`Player ${client.sessionId} found.`);
    return this.state.players[playerIndex] as PlayerStateImpl;
  }

  private canStartGame(logger: Logger, client: Client): boolean {
    if (this.state.players.some((p) => !p.isReady)) {
      logger.error("Not all players are ready.");
      client.error(ErrorCode.UNREADY_PLAYERS);
      return false;
    }

    if (this.state.players.length < 2) {
      logger.error("Not enough players to start the game.");
      client.error(ErrorCode.NOT_ENOUGH_PLAYERS);
      return false;
    }

    return true;
  }

  private async startGame(logger: Logger, client: Client) {
    this.state.status = "starting";
    await this.lock();

    if (this.state.players.some((p) => !p.isReady)) {
      logger.error("Not all players are ready.");
      client.error(ErrorCode.UNREADY_PLAYERS);
      return;
    }

    if (this.state.players.length < 2) {
      logger.error("Not enough players to start the game.");
      client.error(ErrorCode.NOT_ENOUGH_PLAYERS);
      return;
    }

    this.state.players.forEach((player) => {
      player.budget = DEFAULT_BUDGET;
    });
    this.startRound();
  }

  private startRound() {
    const playersCount = this.state.players.length;
    const topNumber = getTopNumber(playersCount);
    const tilesPerPlayer = getTilesPerPlayer(playersCount);
    const tiles = generateAllTiles(topNumber);
    shuffleArrayInPlace(tiles);

    this.state.players.forEach((player, index) => {
      player.tileCount = tilesPerPlayer;
      player.tiles.splice(0);
      player.tiles.push(...tiles.splice(0, tilesPerPlayer));

      if (player.tiles.some(isStartingTile)) {
        this.state.currentPlayerIndex = index;
      }

      this.clients.find((c) => c.sessionId === player.id)?.view.add;
    });
  }

  private finishRound() {
    const penalties = this.state.players
      .map((player) => player.tiles)
      .map(getPenalty);

    const payload: RoundEndPayload = this.state.players.map((player, index) => {
      const myPenalty = penalties[index];
      const budgetChange = penalties.reduce(
        (acc, otherPenalty) => acc + otherPenalty - myPenalty,
        0
      );

      return {
        playerId: player.id,
        tiles: player.tiles,
        penalty: myPenalty,
        prevBudget: player.budget,
        newBudget: player.budget + budgetChange,
      };
    });

    this.broadcast(SERVER_ACTION.ROUND_END, payload);

    this.state.players.forEach((player, index) => {
      player.budget = payload[index].newBudget;
    });

    const hasBankruptPlayer = this.state.players.some(
      (player) => player.budget <= 0
    );

    if (hasBankruptPlayer) {
      this.finishGame();
    } else {
      this.startRound();
    }
  }

  private async finishGame() {
    const payload: GameEndPayload = this.state.players.map((player) => ({
      playerId: player.id,
      budget: player.budget,
    }));
    this.broadcast(SERVER_ACTION.GAME_END, payload);

    this.state.players.forEach((player) => {
      player.budget = 0;
      player.tileCount = 0;
      player.tiles.splice(0); // Clear tiles
      player.isReady = false; // Reset readiness
    });
    this.state.currentPlayerIndex = 0;
    this.state.status = "waiting"; // Reset game state

    await this.unlock();
  }
}
