import { config } from '../../src/config';

export interface TestConfigPatch {
  heartbeatEnabled?: boolean;
  summarizerEnabled?: boolean;
  subagentsParallel?: boolean;
}

const DEFAULTS: Required<TestConfigPatch> = {
  heartbeatEnabled: true,
  summarizerEnabled: true,
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
}
