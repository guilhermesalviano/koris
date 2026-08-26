import { definePluginConfig } from '../../config/define-config';

export interface SendMessagePluginConfig {
  enabled: boolean;
}

const sendMessageConfig = definePluginConfig<SendMessagePluginConfig>({
  family: 'tools',
  pluginName: 'send-message',
  fallbackDir: __dirname,
  schema: {
    enabled: { yamlKey: 'enabled', envKey: 'TOOLS_SEND_MESSAGE_ENABLED', fallback: 'true', parse: (v) => v === 'true' },
  },
});

export const loadSendMessageConfig = sendMessageConfig.load;
export const writeSendMessageConfigPatch = sendMessageConfig.writePatch;
