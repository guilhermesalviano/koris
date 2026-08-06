import { config } from '../../src/config';

export interface TestConfigPatch {
  heartbeatEnabled?: boolean;
  summarizerEnabled?: boolean;
  tempFolder?: string;
}

const DEFAULTS: Required<TestConfigPatch> = {
  heartbeatEnabled: true,
  summarizerEnabled: true,
  tempFolder: './temp',
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

  Object.defineProperty(config, 'TEMP_FOLDER', {
    value: values.tempFolder,
    configurable: true,
    writable: true,
  });
}
