import { Client, Room } from "@colyseus/core";

import { createRandomId } from "./util";

export type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export abstract class BaseRoom<
  State extends object = any,
  Metadata = any,
  UserData = any,
  AuthData = any
> extends Room<State, Metadata, UserData, AuthData> {
  protected onCreateWithLogger(
    logger: Logger,
    options: any
  ): void | Promise<void> {}

  onCreate(options?: any): void | Promise<void> {
    const logger = this.newLogger();
    const boundaryMessage = `CREATE ${this.roomId}(${this.roomName})`;

    logger.info(`${boundaryMessage} ::: begin`);
    this.onCreateWithLogger(logger, options);
    logger.info(`${boundaryMessage} ::: end`);
  }

  protected onJoinWithLogger(
    logger: Logger,
    client: Client<UserData, AuthData>,
    options: any,
    auth?: AuthData
  ): void {}

  onJoin(
    client: Client<UserData, AuthData>,
    options?: any,
    auth?: AuthData
  ): void | Promise<any> {
    const logger = this.newLogger();
    const boundaryMessage = `${client.sessionId} JOIN ${this.roomId}(${this.roomName})`;

    logger.info(`${boundaryMessage} ::: begin`);
    this.onJoinWithLogger(logger, client, options, auth);
    logger.info(`${boundaryMessage} ::: end`);
  }

  protected onLeaveWithLogger(
    logger: Logger,
    client: Client<UserData, AuthData>,
    consented?: boolean
  ): void | Promise<void> {}

  async onLeave(
    client: Client<UserData, AuthData>,
    consented?: boolean
  ): Promise<void> {
    const logger = this.newLogger();
    const boundaryMessage = `${client.sessionId} LEAVE ${this.roomId}(${this.roomName})`;

    logger.info(`${boundaryMessage} ::: begin`);
    await this.onLeaveWithLogger(logger, client, consented);
    logger.info(`${boundaryMessage} ::: end`);
  }

  protected onDisposeWithLogger(logger: Logger): void | Promise<void> {}
  async onDispose(): Promise<void> {
    const logger = this.newLogger();
    const boundaryMessage = `DISPOSE ${this.roomId}(${this.roomName})`;

    logger.info(`${boundaryMessage} ::: begin`);
    await this.onDisposeWithLogger(logger);
    logger.info(`${boundaryMessage} ::: end`);
  }

  protected onMessageWithLogger<T>(
    messageType: string | number,
    callback: (
      logger: Logger,
      client: Client<UserData, AuthData>,
      message: T
    ) => void,
    validate?: (message: unknown) => T
  ) {
    return this.onMessage(
      messageType,
      (client, message) => {
        const logger = this.newLogger();
        const boundaryMessage = `${client.sessionId} -(${messageType})-> ${this.roomId}(${this.roomName})`;

        logger.info(`${boundaryMessage} ::: begin`);
        callback(logger, client, message);
        logger.info(`${boundaryMessage} ::: end`);
      },
      validate
    );
  }

  private newLogger(): Logger {
    const loggerId = createRandomId(6);

    return {
      info: (msg: string) => console.log(`[${loggerId} INFO] ${msg}`),
      warn: (msg: string) => console.warn(`[${loggerId} WARN] ${msg}`),
      error: (msg: string) => console.error(`[${loggerId} ERR ] ${msg}`),
    };
  }
}
