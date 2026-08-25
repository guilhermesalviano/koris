import { describe, it, expect, vi, afterEach } from 'vitest';
import { config } from '../../../../src/config';
import { getAIProvider, clearProviderCache } from '../../../../src/services/providers';
import { SerialAIProvider } from '../../../../src/services/providers/serial-provider';
import type { ILogger } from '../../../../src/infrastructure/logger';

const logger: ILogger = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
};

function setParallel(value: boolean): void {
  Object.defineProperty(config.AI, 'PARALLEL', { value, configurable: true, writable: true });
}

describe('getAIProvider', () => {
  afterEach(() => {
    setParallel(true);
    clearProviderCache();
  });

  it('still wraps the provider when ai.parallel is true', () => {
    setParallel(true);
    clearProviderCache();
    const provider = getAIProvider(logger, 'manager');
    expect(provider).toBeInstanceOf(SerialAIProvider);
  });

  it('wraps the provider in a SerialAIProvider when ai.parallel is false', () => {
    setParallel(false);
    clearProviderCache();
    const provider = getAIProvider(logger, 'manager');
    expect(provider).toBeInstanceOf(SerialAIProvider);
  });

  it('caches a single instance per role for a given mode', () => {
    setParallel(false);
    clearProviderCache();
    const first = getAIProvider(logger, 'manager');
    const second = getAIProvider(logger, 'manager');
    expect(first).toBe(second);
  });

  it('keeps interactive and background worker instances separate', () => {
    setParallel(false);
    clearProviderCache();
    const interactive = getAIProvider(logger, 'worker');
    const background = getAIProvider(logger, 'worker', { background: true });
    expect(interactive).toBeInstanceOf(SerialAIProvider);
    expect(background).toBeInstanceOf(SerialAIProvider);
    expect(interactive).not.toBe(background);
  });

  it('returns separate tracked instances for each priority in parallel mode', () => {
    setParallel(true);
    clearProviderCache();
    const interactive = getAIProvider(logger, 'worker');
    const background = getAIProvider(logger, 'worker', { background: true });
    expect(interactive).toBeInstanceOf(SerialAIProvider);
    expect(background).toBeInstanceOf(SerialAIProvider);
    expect(interactive).not.toBe(background);
  });
});
