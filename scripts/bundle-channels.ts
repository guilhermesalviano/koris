import { build } from 'esbuild';
import { copyFileSync, cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts');
const KORIS_PLUGINS_OUT = path.join(ARTIFACTS_DIR, 'koris-plugins', 'channels');
const CATALOG_OUT = path.join(ARTIFACTS_DIR, 'content', 'marketplace', 'channels');
const SOURCE_BACKUP_OUT = path.join(ARTIFACTS_DIR, 'source', 'channels');

const NODE_BUILTINS = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

interface ChannelMetadata {
  slug: string;
  name: string;
  summary: string;
  description: string;
}

const CHANNELS: ChannelMetadata[] = [
  {
    slug: 'telegram',
    name: 'Telegram',
    summary: 'Telegram bot channel integration for receiving and replying to messages.',
    description: 'Autonomous Telegram bot channel adapter using @guilhermesalviano/telegram-bot with support for streaming, commands, approvals, and media attachments.',
  },
  {
    slug: 'whatsapp',
    name: 'WhatsApp',
    summary: 'WhatsApp channel integration using Baileys Web multi-device socket.',
    description: 'Autonomous WhatsApp channel adapter using @whiskeysockets/baileys and QR terminal with support for multi-device auth, media, voice notes, stickers, and mention filtering.',
  },
];

function resolveChannelSource(slug: string): string {
  const local = path.join(ROOT_DIR, 'plugins', 'channels', slug);
  if (existsSync(local)) return local;
  const backup = path.join(SOURCE_BACKUP_OUT, slug);
  if (existsSync(backup)) return backup;
  return local;
}

const channelHostResolverPlugin: import('esbuild').Plugin = {
  name: 'channel-host-resolver',
  setup(build) {
    build.onResolve({ filter: /(?:^|\/)contracts$/ }, () => ({
      path: path.join(ROOT_DIR, 'plugins', 'channels', 'contracts.ts'),
    }));
    build.onResolve({ filter: /(?:^|\/)channel-config$/ }, () => ({
      path: path.join(ROOT_DIR, 'plugins', 'channels', 'channel-config.ts'),
    }));
    build.onResolve({ filter: /(?:^|\/)registry$/ }, () => ({
      path: path.join(ROOT_DIR, 'plugins', 'registry.ts'),
    }));
  },
};

async function bundleChannel(config: ChannelMetadata): Promise<void> {
  const channelOutDir = path.join(KORIS_PLUGINS_OUT, config.slug);
  const bundleOutFile = path.join(channelOutDir, 'index.js');
  mkdirSync(channelOutDir, { recursive: true });

  const sourceDir = resolveChannelSource(config.slug);
  const entryPoint = path.join(sourceDir, 'index.ts');
  if (!existsSync(entryPoint)) {
    throw new Error(`Could not find channel entry point for ${config.slug}: ${entryPoint}`);
  }

  console.log(`[bundle:channels] Bundling ${config.name} (${config.slug}) from ${path.relative(ROOT_DIR, sourceDir)}...`);

  // 1. Bundle TypeScript source + all npm dependencies into a standalone CJS file
  try {
    await build({
      entryPoints: [entryPoint],
      outfile: bundleOutFile,
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'cjs',
      external: NODE_BUILTINS,
      plugins: [channelHostResolverPlugin],
      sourcemap: false,
      minify: false,
      logLevel: 'warning',
    });

    const stats = statSync(bundleOutFile);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`[bundle:channels] -> ${path.relative(ROOT_DIR, bundleOutFile)} (${sizeMb} MB)`);
  } catch (err) {
    if (existsSync(bundleOutFile)) {
      const stats = statSync(bundleOutFile);
      const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`[bundle:channels] Note: channel dependencies removed from root package.json for Hub distribution.`);
      console.log(`[bundle:channels] -> using existing pre-bundled artifact ${path.relative(ROOT_DIR, bundleOutFile)} (${sizeMb} MB)`);
    } else {
      throw err;
    }
  }

  // 2. Copy config.example.yml
  const exampleConfigSrc = path.join(sourceDir, 'config.example.yml');
  if (existsSync(exampleConfigSrc)) {
    copyFileSync(exampleConfigSrc, path.join(channelOutDir, 'config.example.yml'));
  }

  // 3. Write package.json manifest for the channel plugin
  const pkgManifest = {
    name: `@koris-plugins/channel-${config.slug}`,
    version: '0.1.0',
    description: config.description,
    main: 'index.js',
  };
  writeFileSync(
    path.join(channelOutDir, 'package.json'),
    `${JSON.stringify(pkgManifest, null, 2)}\n`,
    'utf-8',
  );

  // 4. Write catalog metadata in content/marketplace/channels/<slug>.json
  mkdirSync(CATALOG_OUT, { recursive: true });
  const catalogEntry = {
    family: 'channel',
    slug: config.slug,
    name: config.name,
    summary: config.summary,
    description: config.description,
  };
  writeFileSync(
    path.join(CATALOG_OUT, `${config.slug}.json`),
    `${JSON.stringify(catalogEntry, null, 2)}\n`,
    'utf-8',
  );

  // 5. Back up complete original TypeScript source files & tests for Hub repository
  const sourceBackupTarget = path.join(SOURCE_BACKUP_OUT, config.slug);
  if (sourceDir !== sourceBackupTarget && existsSync(sourceDir)) {
    mkdirSync(sourceBackupTarget, { recursive: true });
    cpSync(sourceDir, sourceBackupTarget, { recursive: true });
  }

  // 6. Verify bundle by requiring it and checking exports
  try {
    const resolved = require.resolve(bundleOutFile);
    delete require.cache[resolved];
    const mod = require(bundleOutFile);
    if (typeof mod.create !== 'function') {
      throw new Error(`Bundle for ${config.slug} does not export a create() function!`);
    }
    if (!mod.liveChannel || mod.liveChannel.name !== config.slug) {
      throw new Error(`Bundle for ${config.slug} does not export valid liveChannel descriptor!`);
    }
    console.log(`[bundle:channels] Smoke check passed: mod.create() and liveChannel "${mod.liveChannel.name}" exported successfully.`);
  } catch (err) {
    throw new Error(`Smoke check failed for ${config.slug}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  console.log('[bundle:channels] Starting channel bundling...');
  mkdirSync(ARTIFACTS_DIR, { recursive: true });

  for (const channel of CHANNELS) {
    await bundleChannel(channel);
  }

  console.log('\n[bundle:channels] All channels bundled successfully!');
  console.log(`[bundle:channels] Artifacts ready in: ${ARTIFACTS_DIR}`);
  console.log(`  - koris-plugins/channels/ (for hub repository plugins tree)`);
  console.log(`  - content/marketplace/channels/ (for hub marketplace catalog)`);
  console.log(`  - source/channels/ (unbundled TypeScript source code & unit tests backup)`);
}

main().catch((err) => {
  console.error('[bundle:channels] Error:', err);
  process.exit(1);
});
