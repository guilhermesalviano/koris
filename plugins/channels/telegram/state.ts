import type { IChannelHandlerFactory } from '../contracts';

export const telegramState = {
  botUsername: null as string | null,
  botToken: '',
  channelHandler: undefined as unknown as IChannelHandlerFactory,
  telegramWhitelist: new Set<number>(),
  allowUntrusted: false,
};

/** @internal — only for use in tests */
export function _setBotUsernameForTesting(username: string | null): void {
  telegramState.botUsername = username;
}

/** @internal — only for use in tests */
export function _setTelegramWhitelistForTesting(ids: number[]): void {
  telegramState.telegramWhitelist.clear();
  ids.forEach((id) => telegramState.telegramWhitelist.add(id));
}
