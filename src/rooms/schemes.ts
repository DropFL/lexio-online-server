import { ArraySchema, Schema, type, view } from "@colyseus/schema";
import { GameState, GameStatus, PlayerState } from "../shared/state";
import { Tile, TileColor, TileNumber } from "../shared/tile";

export class TileImpl extends Schema implements Tile {
  @type("int8") number: TileNumber;
  @type("string") color: TileColor;
}

export class PlayerStateImpl extends Schema implements PlayerState {
  @type("string") id: string;
  @type("string") name: string;
  @type("boolean") isReady: boolean = false;
  @type("int32") budget: number;
  @type("int8") tileCount: number;
  @view() @type([TileImpl]) tiles: ArraySchema<Tile> =
    new ArraySchema<TileImpl>();
  @type("boolean") disconnected: boolean = false;
}

export class GameStateImpl extends Schema implements GameState {
  @type([PlayerStateImpl]) players: ArraySchema<PlayerState> =
    new ArraySchema<PlayerStateImpl>();
  @type("int8") currentPlayerIndex: number;
  @type("string") status: GameStatus = "waiting";
}
