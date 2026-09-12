import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { config } from '../../config';
import { DatabaseServiceFactory } from '../../infrastructure/db-sqlite';
import { PluginSettingsRepositoryFactory } from '../../repositories/plugin-settings';
import {
  isChannelLiveStarted,
  loadChannelConfig,
  reprimeChannelRuntime,
  startChannelLive,
  writeChannelConfigPatch,
} from '../../dashboard/live-channel-runtime';
import { registerPulledChannel } from '../plugins/channel-install';
import { ChannelsSingleton } from '../../channels';
import { fetchChannelCatalog, listMissing, pullEntry, type ChannelConfigField } from '../../../../scripts/hub-sync';
import { formatActivatePrompt, missingRequiredFields, parseActivateArgs } from './channel-activation';
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

/**
 * The channel's post-activation note from the hub catalog (WhatsApp's QR
 * pairing, for instance) — the one thing the user still has to do by hand.
 * Silent when koris-hub is unreachable; it's a nicety, not a gate.
 */
async function activationHint(slug: string): Promise<string | undefined> {
  try {
    const catalog = await fetchChannelCatalog({ baseDir: config.BASE_DIR, slugs: [slug] });
    return catalog.find((entry) => entry.slug === slug)?.hints?.pairing;
  } catch {
    return undefined;
  }
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
  const isActivate = sub === 'activate' || sub === 'configure' || sub === 'setup';
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
      // Installed inactive on purpose — see `registerPulledChannel`.
      registerPulledChannel(slug, PluginSettingsRepositoryFactory.create(DatabaseServiceFactory.create()));
      return formatCommandResult(
        `Successfully downloaded channel "${slug}" — installed but inactive.\n\n` +
        `Next: run \`/channels activate ${slug}\` to see which variables it needs, ` +
        `then run it again with those values to configure and switch it on.\n` +
        `You can also configure it in the web dashboard, or edit plugins/channels/${slug}/config.yml directly.`,
        context.source,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return formatCommandResult(`Failed to download channel "${slug}": ${errorMsg}`, context.source);
    }
  }

  if (isActivate) {
    const slug = rawArgs[1]?.toLowerCase();
    if (!slug) {
      return formatCommandResult(
        'Missing channel name.\n\nUsage: /channels activate <name> [key=value ...]\nUse `/channels` to see installed channels.',
        context.source,
      );
    }

    if (!listInstalledChannelNames().includes(slug)) {
      return formatCommandResult(
        `Channel "${slug}" is not installed.\nRun \`/channels download ${slug}\` first.`,
        context.source,
      );
    }

    let fields: ChannelConfigField[] = [];
    try {
      const catalog = await fetchChannelCatalog({ baseDir: config.BASE_DIR, slugs: [slug] });
      fields = catalog.find((entry) => entry.slug === slug)?.configFields ?? [];
    } catch {
      // koris-hub unreachable: fall back to activating with whatever is on
      // disk rather than blocking the user behind a network hiccup.
      fields = [];
    }

    const current = loadChannelConfig(slug) ?? {};
    const answers = parseActivateArgs(rawArgs.slice(2), fields);

    if (answers.invalid.length > 0 || answers.unknownKeys.length > 0) {
      const problems = [
        ...answers.invalid.map((arg) => `  "${arg}" is not a key=value pair`),
        ...answers.unknownKeys.map((key) => `  "${key}" is not a variable of ${slug}`),
      ];
      return formatCommandResult(
        `${problems.join('\n')}\n\n${formatActivatePrompt(slug, fields, current)}`,
        context.source,
      );
    }

    const suppliedAnything = Object.keys(answers.values).length > 0 || answers.useDefaults;
    if (!suppliedAnything) {
      // The "ask" step: show what this channel needs before changing anything.
      return formatCommandResult(formatActivatePrompt(slug, fields, current), context.source);
    }

    const merged = { ...current, ...answers.values };
    const missing = missingRequiredFields(fields, merged);
    if (missing.length > 0) {
      return formatCommandResult(
        formatActivatePrompt(slug, fields, merged, { missingOnly: missing }),
        context.source,
      );
    }

    try {
      if (Object.keys(answers.values).length > 0) {
        writeChannelConfigPatch(slug, answers.values);
        reprimeChannelRuntime(slug);
      }

      const db = DatabaseServiceFactory.create();
      PluginSettingsRepositoryFactory.create(db).setEnabled('channels', slug, true);

      const deps = ChannelsSingleton.getExistingInstance()?.runtimeDeps;
      if (deps) startChannelLive(slug, deps.logger, deps.gateway);

      const saved = Object.keys(answers.values);
      const lines = [`Channel "${slug}" is now active.`];
      if (saved.length > 0) lines.push(`Saved: ${saved.join(', ')}.`);
      lines.push(deps
        ? 'It is starting now — check the server log if it does not come up.'
        : 'It will start on the next restart.');

      const pairing = await activationHint(slug);
      if (pairing) lines.push('', pairing);
      lines.push('', `Run \`/channels disable ${slug}\` to turn it back off.`);

      return formatCommandResult(lines.join('\n'), context.source);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return formatCommandResult(`Failed to activate channel "${slug}": ${errorMsg}`, context.source);
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
    'Usage: /channels [remote | download <name> [--force] | activate <name> [key=value ...] | enable <name> | disable <name>]\n\n' +
    '  /channels                          — List installed channels\n' +
    '  /channels remote                   — List available channels in koris-hub\n' +
    '  /channels download <name>          — Download a channel (installed inactive)\n' +
    '  /channels activate <name>          — Show the variables that channel needs\n' +
    '  /channels activate <name> k=v ...  — Set them, then switch the channel on\n' +
    '  /channels enable <name>            — Enable a channel without configuring it\n' +
    '  /channels disable <name>           — Disable a channel',
    context.source,
  );
}
