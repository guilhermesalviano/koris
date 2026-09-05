import { watch, type FSWatcher, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'node:path';
import { transformSync } from 'esbuild';
import type { ILogger } from '../../infrastructure/logger';
import type { ToolPluginContext } from '../../../../plugins/tools/contracts';
import { COMMANDS } from '../../../../plugins/tools/contracts';
import type { Plugin, PluginRegistry } from '../../../../plugins/registry';
import { ToolPluginsSingleton } from './registry-singleton';
import { PluginCatalogSingleton } from '../plugins/plugin-catalog-singleton';

const DEBOUNCE_MS = 500;

interface ToolModule {
  create?(context?: ToolPluginContext): Plugin | null;
}

export interface ToolSyncOptions {
  /** Where new tool source lands — `config.BASE_DIR/plugins/tools` (what `pnpm hub:pull` writes into). */
  sourceDir: string;
  /** Where the live loader `require()`s tools from — `plugins/tools`'s own compiled `__dirname` (`TOOLS_DIR`). */
  distDir: string;
  context: ToolPluginContext;
  registry: PluginRegistry;
  requireModule?: (modulePath: string) => ToolModule;
  transpile?: (source: string, filename: string) => string;
}

/**
 * Watches `plugins/tools/` for tool folders that appear after boot (e.g. from
 * `pnpm hub:pull`, or a UI marketplace pull hitting the exact same directory)
 * and loads them into the *live* process without a rebuild or restart.
 *
 * This only handles brand-new folders, never edits to an already-loaded tool
 * — `pullEntry` (`scripts/hub-sync.ts`) itself refuses to overwrite an
 * existing folder without `--force`, so a pull is additive by construction,
 * and Node's own `require()` cache means an already-loaded module path is
 * never reloaded here (nor should it be: an in-flight chat turn could be
 * mid-call into the old version). Mirrors `SkillSyncService`
 * (`../skills/skill-sync.ts`) in shape, but skills are pure data (no compile
 * step); a tool is a TypeScript module that must become `require()`-able
 * `.js` first, so each new folder's `.ts` files (excluding `*.test.ts`) are
 * transpiled with esbuild and written into `distDir` before being required —
 * matching exactly where `tsc` would eventually place them.
 */
class ToolSyncService {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly knownSlugs: Set<string>;
  private readonly requireModule: (modulePath: string) => ToolModule;
  private readonly transpile: (source: string, filename: string) => string;

  constructor(
    private readonly logger: ILogger,
    private readonly options: ToolSyncOptions,
    knownSlugs: string[],
  ) {
    this.knownSlugs = new Set(knownSlugs);
    this.requireModule = options.requireModule ?? ((modulePath) => require(modulePath) as ToolModule);
    this.transpile = options.transpile ?? ((source, filename) =>
      transformSync(source, { loader: 'ts', format: 'cjs', sourcefile: filename }).code);
  }

  start(): void {
    mkdirSync(this.options.sourceDir, { recursive: true });
    // Catches a tool pulled while the process was down — otherwise its folder
    // would just sit there until some unrelated fs event on sourceDir happens
    // to trigger the watcher below.
    this.sync();
    this.watcher = watch(this.options.sourceDir, { persistent: true }, () => this.scheduleSync());
    this.logger.info('[tool-sync] Watching tools directory for newly pulled plugins');
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.watcher?.close();
    this.watcher = null;
  }

  sync(): void {
    let entries;
    try {
      entries = readdirSync(this.options.sourceDir, { withFileTypes: true });
    } catch {
      return;
    }

    const candidates = entries
      .filter((entry) => entry.isDirectory() && !this.knownSlugs.has(entry.name))
      .map((entry) => entry.name);
    if (candidates.length === 0) return;

    const loaded: string[] = [];
    for (const slug of candidates) {
      // Marked as seen regardless of outcome — a folder that fails to load
      // (bad syntax, no create()) is never retried automatically; fixing it
      // still requires the normal pnpm build + restart path.
      this.knownSlugs.add(slug);
      try {
        if (this.loadTool(slug)) loaded.push(slug);
      } catch (error) {
        this.logger.warn(`[tool-sync] Failed to hot-load tool "${slug}"`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (loaded.length === 0) return;

    ToolPluginsSingleton.replace(this.options.registry.collect(COMMANDS));
    PluginCatalogSingleton.append(loaded.map((name) => ({ family: 'tools' as const, name })));
    this.logger.info(`[tool-sync] Hot-loaded ${loaded.length} new tool(s): ${loaded.join(', ')}`);
  }

  private loadTool(slug: string): boolean {
    const sourceTool = path.join(this.options.sourceDir, slug);
    const distTool = path.join(this.options.distDir, slug);

    const sourceFiles = readdirSync(sourceTool, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'));
    if (sourceFiles.length === 0) return false;

    mkdirSync(distTool, { recursive: true });
    for (const file of sourceFiles) {
      const sourcePath = path.join(sourceTool, file.name);
      const source = readFileSync(sourcePath, 'utf-8');
      const code = this.transpile(source, sourcePath);
      writeFileSync(path.join(distTool, file.name.replace(/\.ts$/, '.js')), code, 'utf-8');
    }

    const mod = this.requireModule(distTool);
    if (typeof mod.create !== 'function') return false;

    const plugin = mod.create(this.options.context);
    if (!plugin) return false;

    plugin.setup(this.options.registry);
    return true;
  }

  private scheduleSync(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.sync(), DEBOUNCE_MS);
  }
}

class ToolSyncSingleton {
  private static instance: ToolSyncService | null = null;

  static getInstance(logger: ILogger, options: ToolSyncOptions, knownSlugs: string[]): ToolSyncService {
    if (!ToolSyncSingleton.instance) {
      ToolSyncSingleton.instance = new ToolSyncService(logger, options, knownSlugs);
    }
    return ToolSyncSingleton.instance;
  }

  static getExistingInstance(): ToolSyncService | null {
    return ToolSyncSingleton.instance;
  }
}

export { ToolSyncService, ToolSyncSingleton };
