import { describe, expect, it } from 'vitest';
import { loadWhatsAppConfig } from './config';

function fileIO(yaml: string) {
  return { exists: () => true, read: () => yaml };
}

describe('whatsapp config: allow_unlisted_senders', () => {
  it('defaults to false when absent from config.yml', () => {
    const cfg = loadWhatsAppConfig({ pluginDir: '/x', fileIO: fileIO('mention_id: "m"\n'), env: {} });
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
