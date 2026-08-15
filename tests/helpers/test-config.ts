import { config } from '../../src/config';

export interface TestConfigPatch {
  heartbeatEnabled?: boolean;
  summarizerEnabled?: boolean;
  tempFolder?: string;
  telegramEnabled?: boolean;
  whatsappEnabled?: boolean;
  subagentsParallel?: boolean;
}

const DEFAULTS: Required<TestConfigPatch> = {
  heartbeatEnabled: true,
  summarizerEnabled: true,
  tempFolder: './temp',
  telegramEnabled: true,
  whatsappEnabled: false,
  subagentsParallel: false,
};

export function applyTestConfigDefaults(patch: TestConfigPatch = {}): void {
  const values = { ...DEFAULTS, ...patch };

  Object.defineProperty(config, 'HEARTBEAT', {
    value: values.heartbeatEnabled,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config.AI, 'SUMMARIZER', {
    value: values.summarizerEnabled,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config.AI, 'SUBAGENTS_PARALLEL', {
    value: values.subagentsParallel,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config.CHANNELS.TELEGRAM, 'ENABLED', {
    value: values.telegramEnabled,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config.CHANNELS.WHATSAPP, 'ENABLED', {
    value: values.whatsappEnabled,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config, 'TEMP_FOLDER', {
    value: values.tempFolder,
    configurable: true,
    writable: true,
  });
}
