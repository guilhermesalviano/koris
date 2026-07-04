import { config } from '../../src/config';

export interface TestConfigPatch {
  heartbeatEnabled?: boolean;
  summarizerEnabled?: boolean;
  tempFolder?: string;
  heartbeatActiveHours?: { start: string; end: string };
}

const DEFAULTS: Required<TestConfigPatch> = {
  heartbeatEnabled: true,
  summarizerEnabled: true,
  tempFolder: './temp',
  heartbeatActiveHours: { start: '08:00', end: '22:00' },
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

  Object.defineProperty(config.HEARTBEAT.ACTIVE_HOURS, 'START', {
    value: values.heartbeatActiveHours.start,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config.HEARTBEAT.ACTIVE_HOURS, 'END', {
    value: values.heartbeatActiveHours.end,
    configurable: true,
    writable: true,
  });
}
