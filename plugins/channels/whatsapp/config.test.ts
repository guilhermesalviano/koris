import { describe, expect, it } from 'vitest';
import { loadWhatsAppConfig } from './config';

function fileIO(yaml: string) {
  return { exists: () => true, read: () => yaml };
}

describe('whatsapp config: bot_number', () => {
  it('reads the value from config.yml', () => {
    const cfg = loadWhatsAppConfig({ pluginDir: '/x', fileIO: fileIO('bot_number: "5511999998888"\n'), env: {} });
    expect(cfg.botNumber).toBe('5511999998888');
  });

  it('defaults to an empty string when absent', () => {
    const cfg = loadWhatsAppConfig({ pluginDir: '/x', fileIO: fileIO('whitelist: ""\n'), env: {} });
    expect(cfg.botNumber).toBe('');
  });

  it('lets the env var override the file', () => {
    const cfg = loadWhatsAppConfig({
      pluginDir: '/x',
      fileIO: fileIO('bot_number: "5511999998888"\n'),
      env: { CHANNELS_WHATSAPP_BOT_NUMBER: '5521888887777' },
    });
    expect(cfg.botNumber).toBe('5521888887777');
  });
});

describe('whatsapp config: allow_unlisted_senders', () => {
  it('defaults to false when absent from config.yml', () => {
    const cfg = loadWhatsAppConfig({ pluginDir: '/x', fileIO: fileIO('bot_number: "m"\n'), env: {} });
    expect(cfg.allowUnlistedSenders).toBe(false);
  });

  it('parses the yaml boolean true', () => {
    const cfg = loadWhatsAppConfig({ pluginDir: '/x', fileIO: fileIO('allow_unlisted_senders: true\n'), env: {} });
    expect(cfg.allowUnlistedSenders).toBe(true);
  });

  it('lets the env var override the file', () => {
    const cfg = loadWhatsAppConfig({
      pluginDir: '/x',
      fileIO: fileIO('allow_unlisted_senders: true\n'),
      env: { CHANNELS_WHATSAPP_ALLOW_UNLISTED_SENDERS: 'false' },
    });
    expect(cfg.allowUnlistedSenders).toBe(false);
  });
});
