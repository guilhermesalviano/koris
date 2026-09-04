import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { listMissing, pullEntry, type HubSyncFileIO, type HubSyncHttp } from './hub-sync';

const BASE_DIR = '/repo';

function makeIO(dirContents: Record<string, string[]> = {}, existingPaths: string[] = []): HubSyncFileIO & { written: Map<string, string> } {
  const written = new Map<string, string>();
  const existing = new Set(existingPaths);
  return {
    written,
    exists: vi.fn((p: string) => existing.has(p)),
    listDirs: vi.fn((p: string) => dirContents[p] ?? []),
    mkdir: vi.fn(),
    writeFile: vi.fn((p: string, content: string) => { written.set(p, content); }),
  };
}

interface HttpFixture {
  tree?: { tree: { path: string; type: 'blob' | 'tree' }[]; truncated?: boolean };
  catalog?: Record<string, { summary?: string }>;
  files?: Record<string, string>;
}

function makeHttp(fixture: HttpFixture = {}): HubSyncHttp {
  const tree = fixture.tree ?? { tree: [], truncated: false };
  const catalog = fixture.catalog ?? {};
  const files = fixture.files ?? {};

  return {
    fetchJson: vi.fn(async (url: string) => {
      if (url.includes('/git/trees/')) return tree;
      const match = url.match(/content\/marketplace\/(tools|skills)\/([^/]+)\.json$/);
      if (match) {
        const slug = match[2]!;
        if (catalog[slug]) return catalog[slug];
        throw new Error(`404: no catalog entry for ${slug}`);
      }
      throw new Error(`Unexpected fetchJson url: ${url}`);
    }),
    fetchText: vi.fn(async (url: string) => {
      if (url in files) return files[url]!;
      throw new Error(`Unexpected fetchText url: ${url}`);
    }),
  };
}

const HUB_TREE = {
  tree: [
    { path: 'koris-plugins/README.md', type: 'blob' as const },
    { path: 'koris-plugins/tools/issue/index.ts', type: 'blob' as const },
    { path: 'koris-plugins/tools/issue/index.test.ts', type: 'blob' as const },
    { path: 'koris-plugins/tools/list-beats/index.ts', type: 'blob' as const },
    { path: 'koris-plugins/tools/list-beats/index.test.ts', type: 'blob' as const },
    { path: 'koris-skills/weather/SKILL.md', type: 'blob' as const },
    { path: 'koris-skills/cat-fact/SKILL.md', type: 'blob' as const },
  ],
  truncated: false,
};

const LOCAL_TOOLS_DIR = path.join(BASE_DIR, 'plugins/tools');
const LOCAL_SKILLS_DIR = path.join(BASE_DIR, 'skills');

describe('listMissing', () => {
  it('reports hub slugs not present locally, skipping stray files directly under the hub dir', async () => {
    const io = makeIO({ [LOCAL_TOOLS_DIR]: ['list-beats'], [LOCAL_SKILLS_DIR]: ['cat-fact'] });
    const http = makeHttp({
      tree: HUB_TREE,
      catalog: { issue: { summary: 'File a GitHub issue.' } },
    });

    const entries = await listMissing({ baseDir: BASE_DIR, io, http });

    expect(entries).toEqual([
      { family: 'skill', slug: 'weather', summary: undefined },
      { family: 'tool', slug: 'issue', summary: 'File a GitHub issue.' },
    ]);
  });

  it('excludes slugs already present locally', async () => {
    const io = makeIO({ [LOCAL_TOOLS_DIR]: ['issue', 'list-beats'], [LOCAL_SKILLS_DIR]: ['weather', 'cat-fact'] });
    const http = makeHttp({ tree: HUB_TREE });

    const entries = await listMissing({ baseDir: BASE_DIR, io, http });

    expect(entries).toEqual([]);
  });

  it('tolerates a missing/failing catalog entry, still reporting the slug without a summary', async () => {
    const io = makeIO();
    const http = makeHttp({ tree: HUB_TREE });

    const entries = await listMissing({ baseDir: BASE_DIR, io, http });

    const issue = entries.find((e) => e.slug === 'issue');
    expect(issue).toEqual({ family: 'tool', slug: 'issue', summary: undefined });
  });

  it('throws when the hub tree is truncated', async () => {
    const io = makeIO();
    const http = makeHttp({ tree: { tree: [], truncated: true } });

    await expect(listMissing({ baseDir: BASE_DIR, io, http })).rejects.toThrow(/truncated/);
  });
});

describe('pullEntry', () => {
  it('rejects a non-kebab-case slug', async () => {
    const io = makeIO();
    const http = makeHttp({ tree: HUB_TREE });

    await expect(pullEntry('Issue Tracker', { baseDir: BASE_DIR, io, http })).rejects.toThrow(/kebab-case/);
  });

  it('rejects a slug attempting path traversal', async () => {
    const io = makeIO();
    const http = makeHttp({ tree: HUB_TREE });

    await expect(pullEntry('../../etc', { baseDir: BASE_DIR, io, http })).rejects.toThrow(/kebab-case/);
  });

  it('throws when the slug is not found in either family', async () => {
    const io = makeIO();
    const http = makeHttp({ tree: HUB_TREE });

    await expect(pullEntry('does-not-exist', { baseDir: BASE_DIR, io, http })).rejects.toThrow(/not found/);
  });

  it('refuses to overwrite an existing local folder without --force', async () => {
    const target = path.join(LOCAL_TOOLS_DIR, 'issue');
    const io = makeIO({}, [target]);
    const http = makeHttp({ tree: HUB_TREE });

    await expect(pullEntry('issue', { baseDir: BASE_DIR, io, http })).rejects.toThrow(/already exists/);
  });

  it('overwrites an existing local folder when --force is passed', async () => {
    const target = path.join(LOCAL_TOOLS_DIR, 'issue');
    const io = makeIO({}, [target]);
    const http = makeHttp({
      tree: HUB_TREE,
      files: {
        'https://raw.githubusercontent.com/guilhermesalviano/koris-hub/main/koris-plugins/tools/issue/index.ts': 'export {}',
        'https://raw.githubusercontent.com/guilhermesalviano/koris-hub/main/koris-plugins/tools/issue/index.test.ts': 'test content',
      },
    });

    const result = await pullEntry('issue', { baseDir: BASE_DIR, io, http, force: true });

    expect(result.family).toBe('tool');
    expect(io.written.get(path.join(target, 'index.ts'))).toBe('export {}');
  });

  it('downloads every file for a tool slug and writes them under plugins/tools/<slug>', async () => {
    const io = makeIO();
    const http = makeHttp({
      tree: HUB_TREE,
      files: {
        'https://raw.githubusercontent.com/guilhermesalviano/koris-hub/main/koris-plugins/tools/list-beats/index.ts': 'tool source',
        'https://raw.githubusercontent.com/guilhermesalviano/koris-hub/main/koris-plugins/tools/list-beats/index.test.ts': 'tool test',
      },
    });

    const result = await pullEntry('list-beats', { baseDir: BASE_DIR, io, http });

    expect(result).toEqual({
      family: 'tool',
      slug: 'list-beats',
      createdFiles: ['plugins/tools/list-beats/index.ts', 'plugins/tools/list-beats/index.test.ts'],
    });
    expect(io.written.get(path.join(LOCAL_TOOLS_DIR, 'list-beats', 'index.ts'))).toBe('tool source');
    expect(io.written.get(path.join(LOCAL_TOOLS_DIR, 'list-beats', 'index.test.ts'))).toBe('tool test');
  });

  it('downloads a skill slug into skills/<slug>', async () => {
    const io = makeIO();
    const http = makeHttp({
      tree: HUB_TREE,
      files: {
        'https://raw.githubusercontent.com/guilhermesalviano/koris-hub/main/koris-skills/weather/SKILL.md': '# Weather',
      },
    });

    const result = await pullEntry('weather', { baseDir: BASE_DIR, io, http });

    expect(result.family).toBe('skill');
    expect(result.createdFiles).toEqual(['skills/weather/SKILL.md']);
    expect(io.written.get(path.join(LOCAL_SKILLS_DIR, 'weather', 'SKILL.md'))).toBe('# Weather');
  });
});
