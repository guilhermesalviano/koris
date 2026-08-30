import { ADAPTERS } from '../contracts';
import type { ChannelDefinition, ILogger, IMessageGateway, Plugin, StickerReference } from '../contracts';
import type { PluginRegistry } from '../../registry';
import { WHATSAPP_CAPABILITIES } from './constants';
import { WhatsAppChannelFactory } from './factory';
import type { WhatsAppPluginOptions } from './types';

export function createWhatsAppAdapter(options: WhatsAppPluginOptions): ChannelDefinition {
  return {
    name: 'whatsapp',
    enabled: () => options.isEnabled(),
    capabilities: WHATSAPP_CAPABILITIES,
    start: (logger: ILogger, gateway: IMessageGateway) => {
      let stopFn: (() => void) | null = null;

      WhatsAppChannelFactory.start({ authFolder: options.authFolder, mentionId: options.mentionId, gateway, logger })
        .then(({ stop }) => { stopFn = stop; })
        .catch((err: Error) => logger.warn(`Failed to start WhatsApp: ${err.message}`));

      return () => { stopFn?.(); };
    },
    sendMessage: async (_logger: ILogger, target: string, message: string) => {
      await WhatsAppChannelFactory.sendText(target, message);
    },
    sendSticker: async (_logger: ILogger, target: string, sticker: StickerReference) => {
      await WhatsAppChannelFactory.sendSticker(target, sticker);
    },
  };
}

export function createWhatsAppPlugin(options: WhatsAppPluginOptions): Plugin {
  return {
    name: 'whatsapp',
    setup(registry: PluginRegistry) {
      registry.extend(ADAPTERS, createWhatsAppAdapter(options));
    },
  };
}
