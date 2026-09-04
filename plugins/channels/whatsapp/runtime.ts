import type { IChannelHandlerFactory } from '../contracts';
import { loadWhatsAppConfig, type WhatsAppPluginConfig } from './config';
import { normalizeNumber } from './mention';
import { whatsappState } from './state';

/**
 * Primes the module-level runtime state (channel handler, bot number,
 * whitelist, trust policy) that `create()` normally sets once at boot, so a
 * caller can (re)start WhatsApp live — e.g. after the setup wizard changes
 * these values — without restarting the process. Re-reads `config.yml` from
 * disk when no `config` is passed explicitly — which also picks up an
 * `allow_unlisted_senders` change saved via the web UI. Returns the resolved
 * config so callers don't need to know its shape ahead of time.
 */
export function configureWhatsAppRuntime(cfg: {
  channelHandler: IChannelHandlerFactory;
  config?: WhatsAppPluginConfig;
}): WhatsAppPluginConfig {
  const resolved = cfg.config ?? loadWhatsAppConfig();
  whatsappState.channelHandler = cfg.channelHandler;
  whatsappState.botNumber = normalizeNumber(resolved.botNumber);
  whatsappState.whitelist = resolved.whitelist.split(',').map((num) => num.trim()).filter(Boolean);
  whatsappState.allowUntrusted = resolved.allowUnlistedSenders;
  return resolved;
}
