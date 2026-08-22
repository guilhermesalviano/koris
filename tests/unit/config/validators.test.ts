import { describe, expect, it } from 'vitest';

import {
  isValidUrl,
  isValidLogLevel,
  isValidTelegramTokenFormat,
  isSupportedProvider,
  checkAiProviderConnectivity,
} from '../../../src/config/validators';

describe('config/validators', () => {
  it('validates URLs', () => {
    expect(isValidUrl('http://localhost:11434')).toBe(true);
    expect(isValidUrl('not-a-url')).toBe(false);
  });

  it('validates log levels', () => {
    expect(isValidLogLevel('debug')).toBe(true);
    expect(isValidLogLevel('verbose')).toBe(true);
    expect(isValidLogLevel('nonsense')).toBe(false);
  });

  it('validates telegram bot token format', () => {
    expect(isValidTelegramTokenFormat('123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab')).toBe(true);
    expect(isValidTelegramTokenFormat('not-a-token')).toBe(false);
  });

  it('validates supported providers against the real provider registry', () => {
    expect(isSupportedProvider('mock')).toBe(true);
    expect(isSupportedProvider('ollama')).toBe(true);
    expect(isSupportedProvider('nvidia')).toBe(true);
    expect(isSupportedProvider('anthropic')).toBe(false);
    expect(isSupportedProvider('discord')).toBe(false);
  });

  it('skips connectivity checks for the mock provider', async () => {
    const result = await checkAiProviderConnectivity({
      label: 'manager',
      provider: 'mock',
      baseUrl: 'http://localhost:11434',
      apiToken: '',
    });

    expect(result).toEqual({ ok: true, skipped: true });
  });

  it('reports an error result when the provider is unreachable', async () => {
    const result = await checkAiProviderConnectivity(
      { label: 'manager', provider: 'ollama', baseUrl: 'http://127.0.0.1:1', apiToken: '' },
      500,
    );

    expect(result.ok).toBe(false);
  });
});
