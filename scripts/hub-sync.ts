import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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

export type HubFamily = 'tool' | 'skill';

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

export interface HubEntry {
  family: HubFamily;
  slug: string;
  summary?: string;
}

interface CatalogMeta {
  summary?: string;
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
      try {
        const meta = await resolved.http.fetchJson<CatalogMeta>(
          `https://raw.githubusercontent.com/${resolved.owner}/${resolved.repo}/${resolved.branch}/${config.catalogDir}/${slug}.json`,
        );
        summary = meta.summary;
      } catch {
        // Metadata is best-effort — still report the slug without a summary.
      }
      entries.push({ family, slug, summary });
    }
  }

  return entries.sort((a, b) => a.family.localeCompare(b.family) || a.slug.localeCompare(b.slug));
}

export interface PullResult {
  family: HubFamily;
  slug: string;
  /** paths relative to this repo's root */
  createdFiles: string[];
}

export async function pullEntry(slug: string, options: HubSyncOptions & { force?: boolean } = {}): Promise<PullResult> {
  if (!NAME_PATTERN.test(slug)) {
    throw new Error(`Invalid slug "${slug}": must be lowercase kebab-case (e.g. "weather"), no path separators or dots.`);
  }

  const resolved = resolveOptions(options);
  const tree = await fetchHubTree(resolved);

  let match: { family: HubFamily; files: string[] } | undefined;
  for (const [family, config] of Object.entries(FAMILIES) as [HubFamily, FamilyConfig][]) {
    const files = slugFilesUnder(tree, config.hubDir).get(slug);
    if (files) {
      match = { family, files };
      break;
    }
  }
  if (!match) {
    throw new Error(`"${slug}" was not found under koris-plugins/tools or koris-skills in ${resolved.owner}/${resolved.repo}@${resolved.branch}.`);
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
