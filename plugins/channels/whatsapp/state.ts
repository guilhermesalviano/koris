import type { IChannelHandlerFactory } from '../contracts';
import type { SocketLike } from './types';

export const whatsappState = {
  channelHandler: undefined as unknown as IChannelHandlerFactory,
  /** The bot's phone number (digits), from `bot_number` config or auto-detected. */
  botNumber: '',
  /** The bot's LID (digits), auto-detected from the session — mentions in LID-addressed groups use this. */
  botLid: '',
  whitelist: [] as string[],
  allowUntrusted: false,
  activeSocket: null as SocketLike | null,
};
