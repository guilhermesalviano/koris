import { config, SummarizerMode } from '../../src/config';

export interface TestConfigPatch {
  heartbeatEnabled?: boolean;
  summarizerMode?: SummarizerMode;
  subagentsParallel?: boolean;
}

const DEFAULTS: Required<TestConfigPatch> = {
  heartbeatEnabled: true,
  summarizerMode: 'auto',
  subagentsParallel: false,
};

export function applyTestConfigDefaults(patch: TestConfigPatch = {}): void {
  const values = { ...DEFAULTS, ...patch };

  Object.defineProperty(config, 'HEARTBEAT', {
    value: values.heartbeatEnabled,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config.SESSION, 'SUMMARIZER_MODE', {
    value: values.summarizerMode,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(config.AI, 'SUBAGENTS_PARALLEL', {
    value: values.subagentsParallel,
    configurable: true,
    writable: true,
  });
}
