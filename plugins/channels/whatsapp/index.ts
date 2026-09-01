import type { IMessageGateway, ImageAttachment, LiveChannelDescriptor, Plugin, PluginContext } from '../contracts';
import { createWhatsAppPlugin } from './adapter';
import { WhatsAppChannel } from './channel';
import { loadWhatsAppConfig, writeWhatsAppConfigPatch, type WhatsAppPluginConfig } from './config';
import { NOT_AUTHORIZED_MESSAGE } from './constants';
import { _resetWhatsAppDedupeForTesting } from './dedupe';
import { WhatsAppChannelFactory } from './factory';
import { configureWhatsAppRuntime } from './runtime';
import type { IWhatsAppChannel } from './types';

const whatsappChannel = WhatsAppChannelFactory.create();

async function handleMessage(gateway: IMessageGateway, jid: string, name: string, text: string, images?: ImageAttachment[]): Promise<void> {
  await whatsappChannel.handleMessage(gateway, jid, name, text, images);
}

async function sendText(jid: string, text: string): Promise<void> {
  await whatsappChannel.sendText(jid, text);
}

export {
  createWhatsAppPlugin,
  handleMessage,
  IWhatsAppChannel,
  loadWhatsAppConfig,
  sendText,
  WhatsAppChannel,
  WhatsAppChannelFactory,
  WhatsAppPluginConfig,
  writeWhatsAppConfigPatch,
  NOT_AUTHORIZED_MESSAGE,
  configureWhatsAppRuntime,
  _resetWhatsAppDedupeForTesting,
};

export const liveChannel: LiveChannelDescriptor = {
  name: 'whatsapp',
  configureRuntime: ({ channelHandler }) =>
    configureWhatsAppRuntime({ channelHandler }) as unknown as Record<string, unknown>,
  start: ({ channelHandler, gateway, logger }) => {
    const cfg = configureWhatsAppRuntime({ channelHandler });
    return WhatsAppChannelFactory.start({ authFolder: cfg.authFolder, mentionId: cfg.mentionId, gateway, logger });
  },
  loadConfig: () => loadWhatsAppConfig() as unknown as Record<string, unknown>,
  writeConfigPatch: (patch) => writeWhatsAppConfigPatch(patch),
};

export function create(context: PluginContext, configOverride?: WhatsAppPluginConfig): Plugin {
  const cfg = configOverride ?? loadWhatsAppConfig();

  configureWhatsAppRuntime({
    channelHandler: context.channelHandler,
    config: cfg,
  });

  return createWhatsAppPlugin({
    isEnabled: () => context.pluginEnablement.isEnabled('whatsapp'),
    authFolder: cfg.authFolder,
    mentionId: cfg.mentionId,
  });
}
