import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path, { basename } from 'node:path';
import { NAME_PATTERN } from './scaffold-tool';

/**
 * Pulls tool/skill plugin source from the `koris-hub` repo
 * (github.com/guilhermesalviano/koris-hub) into this repo's `plugins/tools/<slug>/`
 * or `plugins/skills/<slug>/` — the mirror image of what moved out in
 * `f5bc0b2 "refactor: removing specific tools"`. koris-hub's own README documents
 * the layout this relies on: `koris-plugins/tools/<slug>/` and `koris-plugins/skills/<slug>/`,
 * each with a matching `content/marketplace/<family>/<slug>.json` metadata entry.
 * Both the dev CLI (`scripts/hub-sync-cli.ts`) call into this module.
 */

export type HubFamily = 'tool' | 'skill' | 'channel';

interface FamilyConfig {
  /** directory under the koris-hub repo root holding one folder per plugin */
  hubDir: string;
  /** matching directory under this repo's root */
  localDir: string;
  /** directory under koris-hub's content/marketplace/ holding <slug>.json metadata */
  catalogDir: string;
}

const FAMILIES: Record<HubFamily, FamilyConfig> = {
  tool: { hubDir: 'koris-plugins/tools', localDir: 'plugins/tools', catalogDir: 'content/marketplace/tools' },
  skill: { hubDir: 'koris-plugins/skills', localDir: 'plugins/skills', catalogDir: 'content/marketplace/skills' },
  channel: { hubDir: 'koris-plugins/channels', localDir: 'plugins/channels', catalogDir: 'content/marketplace/channels' },
};

const HUB_OWNER = 'guilhermesalviano';
const HUB_REPO = 'koris-hub';
const HUB_BRANCH = 'main';

export interface HubSyncFileIO {
  exists(targetPath: string): boolean;
  /** immediate subdirectory names of targetPath, or [] if it doesn't exist */
  listDirs(targetPath: string): string[];
  mkdir(targetPath: string): void;
  writeFile(targetPath: string, content: string): void;
}

const defaultFileIO: HubSyncFileIO = {
  exists: existsSync,
  listDirs: (targetPath) => {
    if (!existsSync(targetPath)) return [];
    return readdirSync(targetPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  },
  mkdir: (targetPath) => mkdirSync(targetPath, { recursive: true }),
  writeFile: (targetPath, content) => writeFileSync(targetPath, content, 'utf-8'),
};

export interface HubSyncHttp {
  fetchJson<T>(url: string): Promise<T>;
  fetchText(url: string): Promise<string>;
}

async function httpGet(url: string): Promise<Response> {
  const response = await fetch(url, { headers: { 'User-Agent': 'koris-hub-sync' } });
  if (!response.ok) {
    throw new Error(`Request to ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response;
}

const defaultHttp: HubSyncHttp = {
  fetchJson: async <T>(url: string) => (await httpGet(url)).json() as Promise<T>,
  fetchText: async (url: string) => (await httpGet(url)).text(),
};

export interface HubSyncOptions {
  /** this repo's root. Defaults to the parent of scripts/. */
  baseDir?: string;
  io?: HubSyncFileIO;
  http?: HubSyncHttp;
  owner?: string;
  repo?: string;
  branch?: string;
  hubLocalDir?: string;
}

interface GitTreeEntry {
  path: string;
  type: 'blob' | 'tree';
}

interface GitTreeResponse {
  tree: GitTreeEntry[];
  truncated: boolean;
}

interface ResolvedOptions {
  baseDir: string;
  io: HubSyncFileIO;
  http: HubSyncHttp;
  owner: string;
  repo: string;
  branch: string;
}

function resolveOptions(options: HubSyncOptions): ResolvedOptions {
  return {
    baseDir: path.resolve(options.baseDir ?? path.join(__dirname, '..')),
    io: options.io ?? defaultFileIO,
    http: options.http ?? defaultHttp,
    owner: options.owner ?? HUB_OWNER,
    repo: options.repo ?? HUB_REPO,
    branch: options.branch ?? HUB_BRANCH,
  };
}

async function fetchHubTree(resolved: ResolvedOptions): Promise<GitTreeEntry[]> {
  const { http, owner, repo, branch } = resolved;
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const data = await http.fetchJson<GitTreeResponse>(url);
  if (data.truncated) {
    throw new Error(`${owner}/${repo}@${branch}'s file tree was truncated by the GitHub API — too large to sync in one call.`);
  }
  return data.tree;
}

/** Groups blob paths under `<hubDir>/<slug>/...` by slug, keyed to the path relative to the slug folder. */
function slugFilesUnder(tree: GitTreeEntry[], hubDir: string): Map<string, string[]> {
  const bySlug = new Map<string, string[]>();
  const prefix = `${hubDir}/`;
  for (const entry of tree) {
    if (entry.type !== 'blob' || !entry.path.startsWith(prefix)) continue;
    const rest = entry.path.slice(prefix.length);
    const slashIndex = rest.indexOf('/');
    if (slashIndex === -1) continue; // stray file directly under hubDir, not a plugin folder
    const slug = rest.slice(0, slashIndex);
    const relativeFile = rest.slice(slashIndex + 1);
    const files = bySlug.get(slug) ?? [];
    files.push(relativeFile);
    bySlug.set(slug, files);
  }
  return bySlug;
}

export interface ChannelHints {
  uninstalled?: string;
  inactive?: string;
  active?: string;
  pairing?: string;
  botNumber?: string;
  allowUnlisted?: string;
  whitelist?: string;
}

/**
 * Channels only: one editable config input, mirrored from koris-hub's
 * `content/marketplace/channels/<slug>.json` so koris's setup wizard can render
 * a channel's form from the catalog instead of hard-coding it. `name` is the
 * config key written to the channel's config (e.g. `bot_token`).
 */
export interface ChannelConfigField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'boolean' | 'number';
  placeholder?: string;
  description?: string;
  required?: boolean;
}

export interface HubEntry {
  family: HubFamily;
  slug: string;
  summary?: string;
  hints?: ChannelHints;
}

interface CatalogMeta {
  summary?: string;
  hints?: ChannelHints;
}

export async function listMissing(options: HubSyncOptions = {}): Promise<HubEntry[]> {
  const resolved = resolveOptions(options);
  const tree = await fetchHubTree(resolved);
  const entries: HubEntry[] = [];

  for (const [family, config] of Object.entries(FAMILIES) as [HubFamily, FamilyConfig][]) {
    const bySlug = slugFilesUnder(tree, config.hubDir);
    const localSlugs = new Set(resolved.io.listDirs(path.join(resolved.baseDir, config.localDir)));

    for (const slug of bySlug.keys()) {
      if (localSlugs.has(slug)) continue;

      let summary: string | undefined;
      let hints: ChannelHints | undefined;
      try {
        const meta = await resolved.http.fetchJson<CatalogMeta>(
          `https://raw.githubusercontent.com/${resolved.owner}/${resolved.repo}/${resolved.branch}/${config.catalogDir}/${slug}.json`,
        );
        summary = meta.summary;
        hints = meta.hints;
      } catch {
        // Metadata is best-effort — still report the slug without a summary.
      }
      entries.push({ family, slug, summary, hints });
    }
  }

  return entries.sort((a, b) => a.family.localeCompare(b.family) || a.slug.localeCompare(b.slug));
}

export function formatSlugName(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export interface ChannelCatalogItem {
  slug: string;
  name: string;
  summary?: string;
  hints?: ChannelHints;
  /** editable config inputs for koris's setup wizard form */
  configFields?: ChannelConfigField[];
}

type ChannelCatalogMeta = {
  name?: string;
  summary?: string;
  hints?: ChannelHints;
  configFields?: ChannelConfigField[];
};

export async function fetchChannelCatalog(
  options: HubSyncOptions & { slugs?: string[] } = {},
): Promise<ChannelCatalogItem[]> {
  const resolved = resolveOptions(options);
  const catalogMap = new Map<string, ChannelCatalogItem>();

  const localHubDirs = [
    options.hubLocalDir,
    process.env.KORIS_HUB_DIR,
  ].filter(Boolean) as string[];

  // 1. Check local hub directory if available
  for (const hubDir of localHubDirs) {
    const catalogDir = path.join(hubDir, FAMILIES.channel.catalogDir);
    if (resolved.io.exists(catalogDir)) {
      try {
        const files = readdirSync(catalogDir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const slug = basename(file, '.json');
          if (options.slugs && !options.slugs.includes(slug)) continue;
          const content = readFileSync(path.join(catalogDir, file), 'utf-8');
          const meta = JSON.parse(content) as ChannelCatalogMeta;
          catalogMap.set(slug, {
            slug,
            name: meta.name || formatSlugName(slug),
            summary: meta.summary,
            hints: meta.hints,
            configFields: meta.configFields,
          });
        }
      } catch {
        // Fall through
      }
    }
  }

  // 2. Discover channels from hub tree
  if (catalogMap.size === 0) {
    try {
      const tree = await fetchHubTree(resolved);
      const hubSlugs = new Set<string>(options.slugs ?? []);
      for (const slug of slugFilesUnder(tree, FAMILIES.channel.hubDir).keys()) {
        hubSlugs.add(slug);
      }
      const prefix = `${FAMILIES.channel.catalogDir}/`;
      for (const entry of tree) {
        if (entry.type === 'blob' && entry.path.startsWith(prefix) && entry.path.endsWith('.json')) {
          const slug = entry.path.slice(prefix.length, -'.json'.length);
          if (slug) hubSlugs.add(slug);
        }
      }

      for (const slug of hubSlugs) {
        if (options.slugs && !options.slugs.includes(slug)) continue;
        try {
          const meta = await resolved.http.fetchJson<ChannelCatalogMeta>(
            `https://raw.githubusercontent.com/${resolved.owner}/${resolved.repo}/${resolved.branch}/${FAMILIES.channel.catalogDir}/${slug}.json`,
          );
          catalogMap.set(slug, {
            slug,
            name: meta.name || formatSlugName(slug),
            summary: meta.summary,
            hints: meta.hints,
            configFields: meta.configFields,
          });
        } catch {
          catalogMap.set(slug, { slug, name: formatSlugName(slug) });
        }
      }
    } catch {
      // Best-effort
    }
  }

  // 3. If explicit slugs were requested, ensure they are in catalogMap even on fetch error
  if (options.slugs) {
    for (const slug of options.slugs) {
      if (!catalogMap.has(slug)) {
        catalogMap.set(slug, { slug, name: formatSlugName(slug) });
      }
    }
  }

  // 4. Include any channel installed locally on disk
  const localSlugs = resolved.io.listDirs(path.join(resolved.baseDir, FAMILIES.channel.localDir));
  for (const slug of localSlugs) {
    if (!catalogMap.has(slug)) {
      catalogMap.set(slug, {
        slug,
        name: formatSlugName(slug),
      });
    }
  }

  return Array.from(catalogMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchChannelHints(
  slugs?: string[],
  options: HubSyncOptions = {},
): Promise<Record<string, ChannelHints>> {
  const catalog = await fetchChannelCatalog({ ...options, slugs });
  const result: Record<string, ChannelHints> = {};
  for (const item of catalog) {
    if (slugs && !slugs.includes(item.slug)) continue;
    if (item.hints) {
      result[item.slug] = item.hints;
    }
  }
  return result;
}

export interface PullResult {
  family: HubFamily;
  slug: string;
  /** paths relative to this repo's root */
  createdFiles: string[];
}

export async function pullEntry(
  slug: string,
  options: HubSyncOptions & { force?: boolean; family?: HubFamily } = {},
): Promise<PullResult> {
  if (!NAME_PATTERN.test(slug)) {
    throw new Error(`Invalid slug "${slug}": must be lowercase kebab-case (e.g. "weather"), no path separators or dots.`);
  }

  const resolved = resolveOptions(options);
  const tree = await fetchHubTree(resolved);

  let match: { family: HubFamily; files: string[] } | undefined;
  for (const [family, config] of Object.entries(FAMILIES) as [HubFamily, FamilyConfig][]) {
    if (options.family && family !== options.family) continue;
    const files = slugFilesUnder(tree, config.hubDir).get(slug);
    if (files) {
      match = { family, files };
      break;
    }
  }
  if (!match) {
    if (options.family) {
      throw new Error(`"${slug}" was not found under ${FAMILIES[options.family].hubDir} in ${resolved.owner}/${resolved.repo}@${resolved.branch}.`);
    }
    throw new Error(`"${slug}" was not found under koris-plugins/tools, koris-plugins/skills, or koris-plugins/channels in ${resolved.owner}/${resolved.repo}@${resolved.branch}.`);
  }

  const { family, files } = match;
  const config = FAMILIES[family];
  const localRoot = path.join(resolved.baseDir, config.localDir);
  const target = path.join(localRoot, slug);
  // Defense in depth beyond NAME_PATTERN: the resolved target must stay
  // strictly inside the family's local dir.
  if (!(target + path.sep).startsWith(localRoot + path.sep)) {
    throw new Error('Refusing to write outside the plugin directory.');
  }
  if (resolved.io.exists(target) && !options.force) {
    throw new Error(`"${config.localDir}/${slug}" already exists locally. Pass --force to overwrite.`);
  }

  resolved.io.mkdir(target);
  const createdFiles: string[] = [];
  for (const relativeFile of files) {
    const content = await resolved.http.fetchText(
      `https://raw.githubusercontent.com/${resolved.owner}/${resolved.repo}/${resolved.branch}/${config.hubDir}/${slug}/${relativeFile}`,
    );
    const filePath = path.join(target, relativeFile);
    const fileDir = path.dirname(filePath);
    if (fileDir !== target) resolved.io.mkdir(fileDir);
    resolved.io.writeFile(filePath, content);
    createdFiles.push(path.join(config.localDir, slug, relativeFile));
  }

  return { family, slug, createdFiles };
}
