import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { config } from '../../config';
import { DatabaseServiceFactory } from '../../infrastructure/db-sqlite';
import { PluginSettingsRepositoryFactory } from '../../repositories/plugin-settings';
import { isChannelLiveStarted, reprimeLiveChannelDescriptors } from '../../dashboard/live-channel-runtime';
import { PluginCatalogSingleton } from '../plugins/plugin-catalog-singleton';
import { ChannelsSingleton } from '../../channels';
import { listMissing, pullEntry } from '../../../../scripts/hub-sync';
import type { CommandContext, CommandResult } from '../../types/commands';
import { formatCommandResult } from './format';

export interface ChannelCommandSummary {
  name: string;
  enabled: boolean;
  running: boolean;
}

export function listInstalledChannelNames(baseDir: string = config.BASE_DIR): string[] {
  const channelsDir = path.join(baseDir, 'plugins', 'channels');
  if (!existsSync(channelsDir)) {
    return [];
  }
  try {
    return readdirSync(channelsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function listChannels(baseDir: string = config.BASE_DIR): ChannelCommandSummary[] {
  const entries = listInstalledChannelNames(baseDir);
  if (entries.length === 0) {
    return [];
  }

  let db;
  try {
    db = DatabaseServiceFactory.create();
  } catch {
    db = undefined;
  }
  const pluginSettingsRepo = db ? PluginSettingsRepositoryFactory.create(db) : undefined;

  return entries.map((name) => {
    let enabled = false;
    try {
      enabled = pluginSettingsRepo?.getEnabled('channels', name) ?? false;
    } catch {
      enabled = false;
    }
    const running = isChannelLiveStarted(name);
    return { name, enabled, running };
  });
}

export async function handleChannelsCommand(command: string, context: CommandContext): Promise<CommandResult> {
  if (context.trusted === false) {
    return formatCommandResult('Channels are only available to trusted senders.', context.source);
  }

  const rawArgs = command.trim().split(/\s+/).slice(1);
  const sub = rawArgs[0]?.toLowerCase();

  const isRemote = sub === 'remote' || sub === 'available' || (sub === 'list' && rawArgs[1]?.toLowerCase() === 'remote');
  const isLocal = !sub || sub === 'local' || (sub === 'list' && rawArgs[1]?.toLowerCase() !== 'remote');
  const isDownload = sub === 'download' || sub === 'pull' || sub === 'install';
  const isEnable = sub === 'enable';
  const isDisable = sub === 'disable';

  if (isLocal) {
    const channels = listChannels();
    if (channels.length === 0) {
      return formatCommandResult(
        'No channels are installed.\nUse `/channels remote` to see channels available for download.',
        context.source,
      );
    }

    const rows = channels.map((channel) => {
      const statusParts: string[] = [channel.enabled ? 'enabled' : 'disabled'];
      if (channel.running) statusParts.push('running');
      return `  ${channel.name.padEnd(24)} [${statusParts.join(', ')}]`;
    });

    const message =
      `*Channels* (${channels.length})\n\n${rows.join('\n')}\n\n` +
      'Use `/channels remote` to see channels available for download.\n' +
      'Use `/channels download <name>` to install a channel.';
    return formatCommandResult(message, context.source);
  }

  if (isRemote) {
    try {
      const missing = await listMissing({ baseDir: config.BASE_DIR });
      const channels = missing.filter((item) => item.family === 'channel');

      if (channels.length === 0) {
        return formatCommandResult(
          'No new remote channels available in koris-hub. All channels are already installed.',
          context.source,
        );
      }

      const rows = channels.map((c) => `  ${c.slug.padEnd(24)} ${c.summary ?? ''}`.trimEnd());
      const message =
        `*Available Remote Channels* (${channels.length})\n\n${rows.join('\n')}\n\n` +
        'Use `/channels download <name>` to download and install a channel.';
      return formatCommandResult(message, context.source);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return formatCommandResult(`Failed to reach koris-hub: ${errorMsg}`, context.source);
    }
  }

  if (isDownload) {
    const remaining = rawArgs.slice(1);
    const force = remaining.includes('--force');
    const slug = remaining.find((arg) => arg !== '--force')?.toLowerCase();

    if (!slug) {
      return formatCommandResult(
        'Missing channel name.\n\nUsage: /channels download <name> [--force]\nUse `/channels remote` to see available channels.',
        context.source,
      );
    }

    try {
      await pullEntry(slug, { baseDir: config.BASE_DIR, family: 'channel', force });
      reprimeLiveChannelDescriptors();
      PluginCatalogSingleton.append([{ family: 'channels', name: slug }]);
      return formatCommandResult(
        `Successfully downloaded channel "${slug}". Configure it in the web dashboard or plugins/channels/${slug}/config.yml.`,
        context.source,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return formatCommandResult(`Failed to download channel "${slug}": ${errorMsg}`, context.source);
    }
  }

  if (isEnable || isDisable) {
    const slug = rawArgs[1]?.toLowerCase();
    if (!slug) {
      return formatCommandResult(
        `Missing channel name.\n\nUsage: /channels ${sub} <name>`,
        context.source,
      );
    }

    const channels = listChannels();
    const existing = channels.find((c) => c.name === slug);
    if (!existing) {
      return formatCommandResult(
        `Channel "${slug}" is not installed locally.\nUse \`/channels remote\` to check available channels.`,
        context.source,
      );
    }

    try {
      const db = DatabaseServiceFactory.create();
      const repo = PluginSettingsRepositoryFactory.create(db);
      repo.setEnabled('channels', slug, isEnable);

      if (isDisable) {
        ChannelsSingleton.getExistingInstance()?.stopChannel(slug);
      }

      return formatCommandResult(
        `Channel "${slug}" is now ${isEnable ? 'enabled' : 'disabled'}.`,
        context.source,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return formatCommandResult(`Failed to update channel "${slug}": ${errorMsg}`, context.source);
    }
  }

  return formatCommandResult(
    'Usage: /channels [remote | download <name> [--force] | enable <name> | disable <name>]\n\n' +
    '  /channels                  — List installed channels\n' +
    '  /channels remote           — List available channels in koris-hub\n' +
    '  /channels download <name>  — Download a channel from koris-hub\n' +
    '  /channels enable <name>    — Enable a channel\n' +
    '  /channels disable <name>   — Disable a channel',
    context.source,
  );
}
