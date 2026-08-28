import type { PluginIdentity } from './plugin-enablement';

/**
 * Holds the `{family, name}[]` identities of every plugin registered at boot
 * (`core/src/app.ts`'s `createCliRuntime()`), captured before `buildRegistry()`
 * discards `Plugin.name`. Mirrors `ToolPluginsSingleton`
 * (`core/src/services/tools/registry-singleton.ts`) — "build once, read many
 * places" — so the admin API can list every plugin without rescanning
 * `plugins/*` per request.
 */
class PluginCatalogSingleton {
  private static instance: PluginIdentity[] | undefined;

  static getInstance(identities: PluginIdentity[]): PluginIdentity[] {
    if (!PluginCatalogSingleton.instance) {
      PluginCatalogSingleton.instance = identities;
    }
    return PluginCatalogSingleton.instance;
  }

  static getExistingInstance(): PluginIdentity[] {
    return PluginCatalogSingleton.instance ?? [];
  }
}

export { PluginCatalogSingleton };
