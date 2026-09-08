import { describe, it, expect, vi, beforeEach } from 'vitest';
import { config } from '../../../../src/config';

const getEnabledMock = vi.fn();
const setEnabledMock = vi.fn();
vi.mock('../../../../src/repositories/plugin-settings', () => ({
  PluginSettingsRepositoryFactory: {
    create: vi.fn(() => ({
      getEnabled: getEnabledMock,
      setEnabled: setEnabledMock,
    })),
  },
}));

vi.mock('../../../../src/infrastructure/db-sqlite', () => ({
  DatabaseServiceFactory: {
    create: vi.fn(() => ({})),
  },
}));

const isChannelLiveStartedMock = vi.fn();
const reprimeLiveChannelDescriptorsMock = vi.fn();
vi.mock('../../../../src/dashboard/live-channel-runtime', () => ({
  isChannelLiveStarted: (...args: unknown[]) => isChannelLiveStartedMock(...args),
  reprimeLiveChannelDescriptors: () => reprimeLiveChannelDescriptorsMock(),
}));

const appendMock = vi.fn();
vi.mock('../../../../src/services/plugins/plugin-catalog-singleton', () => ({
  PluginCatalogSingleton: {
    append: (...args: unknown[]) => appendMock(...args),
  },
}));

const stopChannelMock = vi.fn();
vi.mock('../../../../src/channels', () => ({
  ChannelsSingleton: {
    getExistingInstance: vi.fn(() => ({
      stopChannel: stopChannelMock,
    })),
  },
}));

const listMissingMock = vi.fn();
const pullEntryMock = vi.fn();
vi.mock('../../../../../scripts/hub-sync', () => ({
  listMissing: (...args: unknown[]) => listMissingMock(...args),
  pullEntry: (...args: unknown[]) => pullEntryMock(...args),
}));

const readdirSyncMock = vi.fn();
const existsSyncMock = vi.fn();
vi.mock('node:fs', () => ({
  readdirSync: (...args: unknown[]) => readdirSyncMock(...args),
  existsSync: (...args: unknown[]) => existsSyncMock(...args),
}));

import { listChannels, handleChannelsCommand } from '../../../../src/services/commands/channels';

describe('channels command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listChannels', () => {
    it('returns empty array when channels directory does not exist', () => {
      existsSyncMock.mockReturnValue(false);
      expect(listChannels()).toEqual([]);
    });

    it('returns channels with enabled and running state', () => {
      existsSyncMock.mockReturnValue(true);
      readdirSyncMock.mockReturnValue([
        { name: 'telegram', isDirectory: () => true },
        { name: 'whatsapp', isDirectory: () => true },
        { name: '.gitkeep', isDirectory: () => false },
      ]);

      getEnabledMock.mockImplementation((family, name) => name === 'telegram');
      isChannelLiveStartedMock.mockImplementation((name) => name === 'telegram');

      const channels = listChannels();
      expect(channels).toEqual([
        { name: 'telegram', enabled: true, running: true },
        { name: 'whatsapp', enabled: false, running: false },
      ]);
    });
  });

  describe('handleChannelsCommand', () => {
    it('rejects untrusted senders', async () => {
      const result = await handleChannelsCommand('/channels', { source: 'tui', trusted: false });
      expect(result.handled).toBe(true);
      expect(result.response).toContain('trusted senders');
    });

    it('reports when no channels are installed', async () => {
      existsSyncMock.mockReturnValue(true);
      readdirSyncMock.mockReturnValue([]);

      const result = await handleChannelsCommand('/channels', { source: 'tui', trusted: true });
      expect(result.handled).toBe(true);
      expect(result.response).toContain('No channels are installed');
      expect(result.response).toContain('/channels remote');
    });

    it('lists installed channels by default', async () => {
      existsSyncMock.mockReturnValue(true);
      readdirSyncMock.mockReturnValue([
        { name: 'telegram', isDirectory: () => true },
        { name: 'whatsapp', isDirectory: () => true },
      ]);
      getEnabledMock.mockImplementation((family, name) => name === 'telegram');
      isChannelLiveStartedMock.mockImplementation((name) => name === 'telegram');

      const result = await handleChannelsCommand('/channels', { source: 'tui', trusted: true });
      expect(result.handled).toBe(true);
      expect(result.response).toContain('Channels (2)');
      expect(result.response).toContain('telegram');
      expect(result.response).toContain('enabled, running');
      expect(result.response).toContain('whatsapp');
      expect(result.response).toContain('disabled');
      expect(result.response).toContain('/channels remote');
    });

    it('lists installed channels with /channels list or /channels local', async () => {
      existsSyncMock.mockReturnValue(true);
      readdirSyncMock.mockReturnValue([
        { name: 'telegram', isDirectory: () => true },
      ]);
      getEnabledMock.mockReturnValue(true);

      const listRes = await handleChannelsCommand('/channels list', { source: 'tui', trusted: true });
      expect(listRes.response).toContain('Channels (1)');

      const localRes = await handleChannelsCommand('/channels local', { source: 'tui', trusted: true });
      expect(localRes.response).toContain('Channels (1)');
    });

    it('lists remote channels available in koris-hub', async () => {
      listMissingMock.mockResolvedValueOnce([
        { family: 'channel', slug: 'telegram', summary: 'Telegram bot channel' },
        { family: 'tool', slug: 'search_engine', summary: 'Search' },
      ]);

      const result = await handleChannelsCommand('/channels remote', { source: 'tui', trusted: true });
      expect(result.handled).toBe(true);
      expect(listMissingMock).toHaveBeenCalledWith({ baseDir: config.BASE_DIR });
      expect(result.response).toContain('Available Remote Channels (1)');
      expect(result.response).toContain('telegram');
      expect(result.response).toContain('Telegram bot channel');
      expect(result.response).not.toContain('search_engine');
      expect(result.response).toContain('/channels download <name>');
    });

    it('handles no remote channels available', async () => {
      listMissingMock.mockResolvedValueOnce([
        { family: 'tool', slug: 'search_engine', summary: 'Search' },
      ]);

      const result = await handleChannelsCommand('/channels remote', { source: 'tui', trusted: true });
      expect(result.response).toContain('All channels are already installed');
    });

    it('handles remote list failure', async () => {
      listMissingMock.mockRejectedValueOnce(new Error('Network error'));
      const result = await handleChannelsCommand('/channels remote', { source: 'tui', trusted: true });
      expect(result.response).toContain('Failed to reach koris-hub: Network error');
    });

    it('validates missing channel name on download', async () => {
      const result = await handleChannelsCommand('/channels download', { source: 'tui', trusted: true });
      expect(result.response).toContain('Missing channel name');
      expect(result.response).toContain('Usage: /channels download');
    });

    it('downloads and reprimies channel from koris-hub', async () => {
      pullEntryMock.mockResolvedValueOnce({
        family: 'channel',
        slug: 'telegram',
        createdFiles: ['index.js'],
      });

      const result = await handleChannelsCommand('/channels download telegram', { source: 'tui', trusted: true });
      expect(pullEntryMock).toHaveBeenCalledWith('telegram', {
        baseDir: config.BASE_DIR,
        family: 'channel',
        force: false,
      });
      expect(reprimeLiveChannelDescriptorsMock).toHaveBeenCalled();
      expect(appendMock).toHaveBeenCalledWith([{ family: 'channels', name: 'telegram' }]);
      expect(result.response).toContain('Successfully downloaded channel "telegram"');
    });

    it('supports --force flag on download', async () => {
      pullEntryMock.mockResolvedValueOnce({
        family: 'channel',
        slug: 'telegram',
        createdFiles: ['index.js'],
      });

      await handleChannelsCommand('/channels download telegram --force', { source: 'tui', trusted: true });
      expect(pullEntryMock).toHaveBeenCalledWith('telegram', {
        baseDir: config.BASE_DIR,
        family: 'channel',
        force: true,
      });
    });

    it('handles download failure', async () => {
      pullEntryMock.mockRejectedValueOnce(new Error('Not found in hub'));
      const result = await handleChannelsCommand('/channels download non-existent', { source: 'tui', trusted: true });
      expect(result.response).toContain('Failed to download channel "non-existent": Not found in hub');
    });

    it('enables an installed channel', async () => {
      existsSyncMock.mockReturnValue(true);
      readdirSyncMock.mockReturnValue([
        { name: 'telegram', isDirectory: () => true },
      ]);

      const result = await handleChannelsCommand('/channels enable telegram', { source: 'tui', trusted: true });
      expect(setEnabledMock).toHaveBeenCalledWith('channels', 'telegram', true);
      expect(result.response).toContain('Channel "telegram" is now enabled.');
    });

    it('disables and stops an installed channel', async () => {
      existsSyncMock.mockReturnValue(true);
      readdirSyncMock.mockReturnValue([
        { name: 'telegram', isDirectory: () => true },
      ]);

      const result = await handleChannelsCommand('/channels disable telegram', { source: 'tui', trusted: true });
      expect(setEnabledMock).toHaveBeenCalledWith('channels', 'telegram', false);
      expect(stopChannelMock).toHaveBeenCalledWith('telegram');
      expect(result.response).toContain('Channel "telegram" is now disabled.');
    });

    it('returns usage instructions for invalid subcommands', async () => {
      const result = await handleChannelsCommand('/channels foobar', { source: 'tui', trusted: true });
      expect(result.response).toContain('Usage: /channels');
    });
  });
});
