import type { IChannelHandlerFactory } from '../contracts';
import { loadTelegramConfig, type TelegramPluginConfig } from './config';
import { telegramState } from './state';

/**
 * Primes the module-level runtime state (channel handler, whitelist, trust
 * policy) that `create()` normally sets once at boot, so a caller can
 * (re)start Telegram live (e.g. after the setup wizard enables it) without
 * restarting the process. Re-reads `config.yml` from disk when no `config`
 * is passed explicitly, mirroring `reloadConfig()`'s "re-read on demand"
 * pattern — which also picks up an `allow_unlisted_senders` change saved via
 * the web UI. Returns the resolved config so callers don't need to know its
 * shape ahead of time.
 */
export function configureTelegramRuntime(cfg: {
  channelHandler: IChannelHandlerFactory;
  config?: TelegramPluginConfig;
}): TelegramPluginConfig {
  const resolved = cfg.config ?? loadTelegramConfig();
  telegramState.botToken = resolved.token;
  telegramState.channelHandler = cfg.channelHandler;
  telegramState.telegramWhitelist = new Set(
    resolved.whitelist.split(',').map((id) => id.trim()).filter(Boolean).map(Number),
  );
  telegramState.allowUntrusted = resolved.allowUnlistedSenders;
  return resolved;
}
