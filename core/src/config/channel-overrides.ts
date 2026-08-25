import { deepGet, loadConfigFile } from './helpers';

export interface ChannelOverride {
  enabled?: boolean;
}

/**
 * Optional `channels.overrides` array in koris.json:
 *   { "channels": { "overrides": [{ "id": "telegram", "enabled": false }] } }
 * (nested under the existing `channels` object, which already holds
 * `allow_untrusted` — a top-level `channels` array would collide with it.)
 *
 * This is a thin, additive override on top of each plugin's own
 * `config.yml`/env vars — not a replacement for them. It can only flip
 * `enabled` on a channel that already registers a `ChannelDefinition`; it
 * cannot supply a token/authFolder a plugin needs to function, and it
 * cannot force a channel to start if the plugin's own config never
 * registered one in the first place (e.g. Telegram's `create()` returns
 * `null`, registering nothing, when its own config has no token — see
 * FINDINGS.md §2.6/§8 for why a deeper migration was deliberately not done
 * here). Anything on an entry besides `id`/`enabled` is ignored, not
 * partially applied.
 */
export function loadChannelOverrides(options?: { cwd?: string; dirname?: string }): Record<string, ChannelOverride> {
  const fileConfig = loadConfigFile({ cwd: options?.cwd, dirname: options?.dirname });
  const raw = deepGet(fileConfig, 'channels.overrides');
  if (!Array.isArray(raw)) {
    return {};
  }

  const overrides: Record<string, ChannelOverride> = {};
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;

    const id = (entry as Record<string, unknown>).id;
    if (typeof id !== 'string' || !id) continue;

    const enabled = (entry as Record<string, unknown>).enabled;
    if (typeof enabled === 'boolean') {
      overrides[id] = { enabled };
    }
  }

  return overrides;
}
