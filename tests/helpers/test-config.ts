import { config } from '../../src/config';

export interface TestConfigPatch {
  heartbeatEnabled?: boolean;
  summarizerEnabled?: boolean;
  tempFolder?: string;
  telegramEnabled?: boolean;
  whatsappEnabled?: boolean;
}

const DEFAULTS: Required<TestConfigPatch> = {
  heartbeatEnabled: true,
  summarizerEnabled: true,
  tempFolder: './temp',
  telegramEnabled: true,
  whatsappEnabled: false,
};

export function applyTestConfigDefaults(patch: TestConfigPatch = {}): void {
  const values = { ...DEFAULTS, ...patch };

  Object.defineProperty(config.HEARTBEAT, 'ENABLED', {
    value: values.heartbeatEnabled,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config.AI.SUMMARIZER, 'ENABLED', {
    value: values.summarizerEnabled,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config.CHANNELS.TELEGRAM, 'ENABLED', {
    value: values.telegramEnabled,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config.CHANNELS.TELEGRAM, 'CHAT_ID', {
    value: '123456789',
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config.CHANNELS.WHATSAPP, 'ENABLED', {
    value: values.whatsappEnabled,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config.CHANNELS.WHATSAPP, 'TARGET_JID', {
    value: '5511999999999@s.whatsapp.net',
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config, 'TEMP_FOLDER', {
    value: values.tempFolder,
    configurable: true,
    writable: true,
  });
}
