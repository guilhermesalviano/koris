import type { IChannelHandlerFactory } from '../contracts';
import type { SocketLike } from './types';

export const whatsappState = {
  channelHandler: undefined as unknown as IChannelHandlerFactory,
  mentionId: '',
  whitelist: [] as string[],
  allowUntrusted: false,
  activeSocket: null as SocketLike | null,
};
