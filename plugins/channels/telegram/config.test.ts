import { describe, expect, it } from 'vitest';
import { loadTelegramConfig } from './config';

function fileIO(yaml: string) {
  return { exists: () => true, read: () => yaml };
}

describe('telegram config: allow_unlisted_senders', () => {
  it('defaults to false when absent from config.yml', () => {
    const cfg = loadTelegramConfig({ pluginDir: '/x', fileIO: fileIO('bot_token: "t"\n'), env: {} });
    expect(cfg.allowUnlistedSenders).toBe(false);
  });

  it('parses the yaml boolean true', () => {
    const cfg = loadTelegramConfig({ pluginDir: '/x', fileIO: fileIO('allow_unlisted_senders: true\n'), env: {} });
    expect(cfg.allowUnlistedSenders).toBe(true);
  });

  it('treats any non-"true" yaml value as false', () => {
    const cfg = loadTelegramConfig({ pluginDir: '/x', fileIO: fileIO('allow_unlisted_senders: "yes"\n'), env: {} });
    expect(cfg.allowUnlistedSenders).toBe(false);
  });

  it('lets the env var override the file', () => {
    const cfg = loadTelegramConfig({
      pluginDir: '/x',
      fileIO: fileIO('allow_unlisted_senders: false\n'),
      env: { CHANNELS_TELEGRAM_ALLOW_UNLISTED_SENDERS: 'true' },
    });
    expect(cfg.allowUnlistedSenders).toBe(true);
  });
});
