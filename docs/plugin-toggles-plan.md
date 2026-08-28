# DB-backed plugin toggles + admin "Plugins" modal

## Context

Today, whether a plugin is active is controlled by an `enabled` key inside that plugin's own gitignored `config.yml` (`plugins/<family>/<name>/config.yml`), read at process boot. For all 12 tool plugins (`plugins/tools/*/`), `enabled` is the *only* key in their config.yml — confirmed by reading all 12 `config.example.yml` files directly. For the 2 channel plugins (`telegram`, `whatsapp`), `enabled` sits alongside real secrets (`bot_token`, `whitelist`, `auth_folder`, `mention_id`).

The user wants a web-admin modal listing every plugin with a toggle to enable/disable it, and wants the `enabled` flag moved out of config.yml entirely — into the database — since a UI now owns it. Confirmed scope with the user: **both tool and channel plugins** are in scope. For tools, this means config.yml (and its config.example.yml template and per-plugin config.ts loader) disappears completely. For channels, only the `enabled` key leaves config.yml; secrets stay.

This also fixes a real gap: today, changing a tool's `enabled` in config.yml requires a full process restart (tools are frozen into `ToolPluginsSingleton` at boot). Moving the check to a DB read makes it live, matching how channels already work today (`ChannelDefinition.enabled` is already a re-evaluated closure).

## Design

1. **New table `plugin_settings`** in `core/src/infrastructure/db-sqlite.ts` (mirrors `learned_skills`'s `enabled INTEGER` shape, ~line 218-232), keyed by `(family, name)` where `family IN ('tools','channels')`. A plugin has no row until first toggled (or migrated) — absence means "use the default".
2. **Defaults, in code, not yaml**: `tools` default `true` except `create-tool` → `false`; `channels` default `false`. One small function (`defaultPluginEnabled(family, name)`) encodes this — no manifest file needed.
3. **One-time legacy migration**: at boot, for every plugin with no DB row yet, check if it still has a local `config.yml` with an explicit `enabled` key (upgrading users) and seed the DB from it, so existing installs don't silently change behavior. Reuses `resolvePluginDir`/yaml loading already in `plugins/config/loader.ts`.
4. **No more boot-time gating for tools.** Every tool plugin's `create()` always returns a `Plugin` (drop `| null`); the on/off check moves into each `ToolDefinition.enabled(opts)` closure, evaluated per request — this is what makes toggling live without a restart.
5. **Channels get simpler, not more complex.** `ChannelDefinition.enabled` is already a live closure; its source swaps from yaml to the DB-backed lookup. `create()` for telegram/whatsapp always returns a `Plugin` now (their only `null`-return case today was `!cfg.enabled`).
6. **New `pluginEnablement` gateway** injected into `ToolPluginContext` and `PluginContext` (channels), matching the existing ISP pattern (`security.gateUrl`, `heartbeats`, etc.) — plugins never touch SQL directly. `core/src/app.ts`'s `createToolPluginContext`/`createPluginContext` (currently `db`-less for channels — needs a `db` param added) wire it to a shared `resolvePluginEnabled()` helper.
7. **Dispatch-time enforcement**: `AgnosticExecutionTool.handle()` (`core/src/services/tools/index.ts`) currently never checks `enabled()` — it worked only because disabled tools were never registered. Once every tool always registers, dispatch must check `enabled({trusted: true, stickersEnabled: true})` too, so a disabled tool can't be invoked directly.
8. **Decommission the second on/off control.** Today `ChannelsStep.tsx`'s "Enable Telegram/WhatsApp" checkboxes write `enabled` into config.yml via `POST /api/admin/settings`, and that handler is also what calls `startTelegramLive`/`startWhatsAppLive` (`core/src/dashboard/admin.ts` ~line 757-764). This must go away — the new Plugins modal becomes the sole on/off control; `ChannelsStep` becomes secrets-only, with a read-only "currently enabled" indicator pointing users at the new modal.

## Implementation

### Backend — data layer
- `core/src/infrastructure/db-sqlite.ts`: add `plugin_settings` table (`family`, `name`, `enabled INTEGER`, `updated_at`, PK `(family, name)`), right after the existing `learned_skills`/`sticker_rules`/`audit_logs` block.
- New `core/src/repositories/plugin-settings.ts`: `PluginSettingsRepository` (`getEnabled(family, name): boolean | null`, `setEnabled(...)` via `INSERT ... ON CONFLICT DO UPDATE` — same upsert style as `core/src/repositories/learned-skills.ts:73`, `getAll()`), plus a `PluginSettingsRepositoryFactory` singleton wrapper like other repos in that directory.
- New `core/src/services/plugins/plugin-enablement.ts`: `defaultPluginEnabled(family, name)`, `resolvePluginEnabled(repo, family, name)`, and `migrateLegacyPluginEnabledFlags(repo, identities, logger)` (the one-time upgrade path described above).
- New `core/src/services/plugins/plugin-catalog-singleton.ts`: `PluginCatalogSingleton`, same "populate once at boot, read many places" shape as `ToolPluginsSingleton` (`core/src/services/tools/registry-singleton.ts`) — holds `{family, name}[]` for every registered plugin, so the admin API doesn't need to rescan `plugins/*` per request.

### Backend — contracts & wiring
- `plugins/tools/contracts.ts`: add `IPluginEnablementGateway { isEnabled(name: string): boolean }` and `pluginEnablement: IPluginEnablementGateway` to `ToolPluginContext`.
- `plugins/channels/contracts.ts`: same interface (duplicated per the existing no-cross-family-import convention, see the `StickerReference` comment in `plugins/tools/contracts.ts:12`) added to `PluginContext`.
- `core/src/app.ts`: give `createPluginContext` a `db` parameter (it currently only takes `logger, gateway`); wire `pluginEnablement.isEnabled` in both `createPluginContext` and `createToolPluginContext` to `resolvePluginEnabled(PluginSettingsRepositoryFactory.create(db), family, name)`. In `createCliRuntime()` (~line 144-155), capture the plugin arrays *before* `buildRegistry()` (which discards `Plugin.name`), call `migrateLegacyPluginEnabledFlags` and `PluginCatalogSingleton.getInstance(...)` with those identities, then build the registry from the same arrays.

### Backend — the 12 tool plugins (`plugins/tools/{curl-request,set-beat,list-beats,update-beat,delete-beat,search-engine,issue,send-message,learn-sticker,send-sticker,unlearn-sticker,create-tool}/`)
For each: delete `config.ts` and `config.example.yml`; in `index.ts`, drop the `loadXConfig` import and the `if (!cfg.enabled) return null` block, change `create(context): Plugin | null` → `create(context): Plugin`, and extend the registered `ToolDefinition`'s `enabled` closure to `&&` in `context.pluginEnablement.isEnabled('<own-name>')` (the literal already sits next to `name: '<own-name>'` in the same object).

Also update `scripts/scaffold-tool.ts` (the `create_tool` generator, used both by the chat tool and `pnpm scaffold:tool`) so newly-scaffolded plugins follow the new pattern instead of resurrecting the old one: drop `buildConfigFile()`/the `config.example.yml` write, update `buildIndexFile()`'s template to match the new `create()` shape. Check `scripts/scaffold-tool-cli.ts` and `plugins/tools/create-tool/index.ts` for hardcoded file-count/name expectations in user-facing output.

### Backend — the 2 channel plugins (`plugins/channels/{telegram,whatsapp}/`)
- `config.ts`: remove `enabled` from the config interface/schema; keep secrets fields.
- `config.example.yml`: remove the `enabled: ...` line only.
- `types.ts`: replace the static `enabled: boolean` field on `TelegramPluginOptions`/`WhatsAppPluginOptions` with a live `isEnabled: () => boolean` getter.
- `adapter.ts`: `enabled: () => options.isEnabled() && options.token.length > 0` (telegram) / `() => options.isEnabled()` (whatsapp).
- `index.ts`: `create()` drops `| null` and the `!cfg.enabled` branch entirely, passes `isEnabled: () => context.pluginEnablement.isEnabled('telegram'|'whatsapp')` into the plugin factory. Keep telegram's existing "warn if token is empty" log, gated on `context.pluginEnablement.isEnabled('telegram')` being true.
- `core/src/config/channel-overrides.ts`: update the comment (~line 9-21) that says `create()` can return null due to missing config — no longer true for the enabled/disabled axis (only genuinely-missing-secrets behavior remains, encoded in `enabled()`'s own token-length check).
- Tests (`index.test.ts` for both): drop `enabled` from config fixtures, add a `pluginEnablement: { isEnabled: () => true }` default to the `PluginContext` test fixture with per-test overrides for the disabled case.

### Backend — dispatch enforcement
`core/src/services/tools/index.ts`'s `AgnosticExecutionTool.handle()`: after matching a tool by name, also check `plugin.enabled({ trusted: true, stickersEnabled: true })` before invoking the handler; return `Unknown tool: <name>` otherwise (matches how `ToolsRepository.getStickerTools()` already defaults `trusted: true` for a similar check).

### Backend — admin API (`core/src/dashboard/admin.ts`)
- Wire `pluginSettingsRepo = PluginSettingsRepositoryFactory.create(db)` in `AdminRouterFactory.create()`, alongside the existing `learnedSkillsRepo` (~line 211).
- New `GET /plugins`: returns `{ items: [{family, name, enabled}] }` from `PluginCatalogSingleton.getExistingInstance()` + `resolvePluginEnabled`. Modeled on `GET /skills` (~line 659-675).
- New `PATCH /plugins/:family/:name`: validates `family` is `'tools'|'channels'` and body `{enabled: boolean}` (400 otherwise), 404 if unknown plugin, calls `pluginSettingsRepo.setEnabled(...)`. When enabling a channel, call `startTelegramLive`/`startWhatsAppLive` (moved here from the settings POST handler). When disabling a channel, call `ChannelsSingleton.getExistingInstance()?.stopChannel(name)` so an already-running channel actually stops live. Modeled on `PATCH /skills/:name` (~line 677-691).
- `buildChannelsSnapshot()` (~line 80-93) and `buildSettingsResponse()` (~line 97): thread `pluginSettingsRepo` through so `TELEGRAM.ENABLED`/`WHATSAPP.ENABLED` read from `resolvePluginEnabled(...)` instead of `telegram.enabled`/`whatsapp.enabled` (which no longer exist on the loaded yaml config).
- `collectSettingsPayloadErrors()` (~line 144-149): the `channels.telegram.enabled === true` check no longer has a payload field to read — change it to check the plugin's *current* DB-backed enabled state, so a user can't blank out `bot_token` while telegram is currently enabled.
- `POST /api/admin/settings` handler (~line 733-764): remove the `enabled`-driven `startTelegramLive`/`startWhatsAppLive` calls (moved to the new PATCH endpoint) and strip any `enabled` key out of the incoming telegram/whatsapp patch before calling `writeTelegramConfigPatch`/`writeWhatsAppConfigPatch`, defensively, so it's a no-op if an old cached frontend still sends it.

### Frontend (`apps/web/src/`)
- New `components/Modal.tsx`: the first reusable modal, modeled directly on `components/ImageLightbox.tsx`'s structure (`role="dialog" aria-modal="true"`, `fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm` backdrop with `onClick={onClose}`/`stopPropagation` on the panel, `useEffect` Escape-key handling + body-scroll lock, cleaned up on close/unmount). Props: `{ open, onClose, title?, children }`.
- New `Toggle`/`Switch` component added to `components/AdminUI.tsx` alongside `Toast`/`Card`/`EmptyState`: `{ checked, onChange, disabled?, label? }`, styled as a pill switch with existing Tailwind tokens.
- New `pages/admin/PluginsModal.tsx`: fetches `GET /plugins` via `apiRequest` (`lib/api.ts`) on open, renders two grouped sections ("Tools", "Channels"), each row = humanized plugin name + `Toggle` wired to `PATCH /plugins/:family/:name` with optimistic update and `useToast` error feedback — modeled on `SkillsPage.tsx`'s `toggleSkill` pattern.
- New types in `lib/types.ts`: `PluginItem { family: 'tools'|'channels'; name: string; enabled: boolean }`.
- `pages/admin/AdminLayout.tsx`: add a "Plugins" trigger button (near the sidebar's `CONFIG_ITEMS`/`Header`, using a new/reused icon from `components/Icons.tsx`) that opens the modal; `AdminLayout` owns the `open` boolean and renders `<PluginsModal>` once.
- `pages/setup/steps/ChannelsStep.tsx`: remove the "Enable Telegram"/"Enable WhatsApp" checkboxes and the `enabled &&`-gated conditionals around secret fields; show secret fields unconditionally, with a read-only "currently enabled" indicator sourced from `RuntimeSettings.CHANNELS.*.ENABLED` pointing users to the new Plugins modal.
- `lib/use-settings-form.ts`: remove `enabled` from `SettingsFormState.telegram`/`.whatsapp` and its serialize/hydrate logic — it's no longer part of the editable settings form.

### Tests
- All 12 tool plugins' `index.test.ts`: add a case asserting the registered `ToolDefinition.enabled()` reflects a mocked `context.pluginEnablement.isEnabled` (false → disabled even when `trusted: true`).
- `telegram/index.test.ts`, `whatsapp/index.test.ts`: update config fixtures (drop `enabled`), add `pluginEnablement` to the context fixture.
- New `core/src/repositories/plugin-settings.test.ts` and `core/src/services/plugins/plugin-enablement.test.ts` (defaults, resolution precedence, migration idempotency/behavior).
- `core/src/services/tools/index.test.ts`: add a "known but disabled tool" case for `AgnosticExecutionTool`.
- Admin route tests (wherever `admin.ts` is tested): `GET /plugins`, `PATCH /plugins/:family/:name` (success, 400 bad family/body, 404 unknown, channel start/stop side effects).
- `scripts/scaffold-tool.test.ts` if it exists: update expected generated file list/content.

### Docs & cleanup
- `AGENTS.md`: update the tools/plugins config description (currently says each tool plugin has its own `config.yml` with `enabled`) to describe DB-backed enablement via the Plugins modal; add `plugin_settings` to the DB schema section.
- `.gitignore`: remove the now-dead `plugins/tools/*/config.yml` entry (line ~23); keep `plugins/channels/*/config.yml` (still holds secrets).

## Suggested sequencing
1. DB table + `PluginSettingsRepository` + `plugin-enablement.ts` (isolated, testable alone).
2. Contracts (`pluginEnablement` on both context types) + `app.ts` wiring + `PluginCatalogSingleton` + migration call.
3. All 12 tool plugins, then `scripts/scaffold-tool.ts`.
4. Telegram then WhatsApp channel plugins + `channel-overrides.ts` comment fix.
5. Dispatch enforcement in `core/src/services/tools/index.ts`.
6. Admin API routes + settings snapshot/validation/POST-handler changes.
7. Frontend: `Modal`, `Toggle`, `PluginsModal`, `AdminLayout` trigger, then `ChannelsStep`/`use-settings-form` decoupling.
8. `AGENTS.md` + `.gitignore` cleanup.

Run `pnpm lint`/`pnpm lint:client` after each batch (tool plugins, then channel plugins, then admin/frontend) to catch drift early, then `pnpm test` at the end.

## Verification
- `pnpm test` and `pnpm lint`/`pnpm lint:client` must pass.
- `pnpm build && pnpm app` (web mode): open the admin UI, click the new "Plugins" trigger, confirm the modal lists all 12 tools + 2 channels with correct current state, toggle a tool off, confirm a subsequent chat message can no longer invoke that tool (no restart), toggle it back on and confirm it works again without restarting.
- Toggle telegram/whatsapp on/off from the modal and confirm the channel actually starts/stops live (check logs), and that `ChannelsStep` in Settings no longer shows an enable checkbox but still lets you edit `bot_token`/`whitelist`/etc.
- Delete a local `plugins/tools/search-engine/config.yml` with `enabled: false` before first boot post-migration, confirm the DB seeds `enabled: false` for it (migration path) rather than reverting to the new code default of `true`.
- Run `pnpm scaffold:tool` (or the `create_tool` chat tool) and confirm the newly generated plugin has no `config.ts`/`config.example.yml` and works immediately without a restart.
