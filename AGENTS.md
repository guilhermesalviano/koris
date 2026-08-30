# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

`koris` is an autonomous AI agent framework written in TypeScript (CommonJS, strict mode). It receives messages through pluggable channels (Telegram, WhatsApp, TUI, web dashboard), runs them through an LLM, and can execute tools (`curl`, search, beats, issue tracking, sticker learning, learned-skills instructions). It has persistent SQLite memory, session tracking, heartbeat (scheduled) agents, and a summarizer sub-agent.

## Tech stack & package manager

- **Package manager:** `pnpm` (`pnpm@10.18.3`, single-package workspace). Never use `npm`/`yarn`.
- **Runtime:** Node >= 24. **Build:** `tsc` → `dist/`. No bundler.
- **Database:** `better-sqlite3` (synchronous, WAL). DB file lives in `core/memory/database.db`.
- **LLM providers:** Ollama (native), an `openai-compatible` client with presets (`openai`, `deepseek`, `groq`, `openrouter`, `xai`, `mistral`, `together`, `gemini`, `nvidia`), and Mock. `koris.json` keeps every configured provider in `ai.providers[]` (creds + `num_ctx` + a `models[]` list) and points each role at one via `ai.roles` (`ai.roles.manager` = main agent, `ai.roles.workers` = workers/summarizer/heartbeat); embeddings are AI-wide (`ai.embedding` / `ai.embed_model`). See "AI providers" below.
- **Testing:** Vitest (globals enabled, `@` alias → `core/src`). Mutation testing via Stryker.
- **Channels:** `@whiskeysockets/baileys` (WhatsApp) and `@guilhermesalviano/telegram-bot`.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm build` | Clean + compile TS → `dist/` and build the web frontend → `dist-web/` (required before `pnpm app`) |
| `pnpm build:client` | Build only the web frontend (`vite build` → `dist-web/`) |
| `pnpm dev:client` | Vite dev server (port 5173), proxies `/api` and `/health` to `localhost:3000` |
| `pnpm app` | Run agent (web on port 3000). Add `--tui` for TUI, `telegram` for Telegram |
| `pnpm onboard` | First-time onboarding flow |
| `pnpm validate` | Validate `koris.json` against expected schema |
| `pnpm lint` | Type-check server (`tsc --noEmit`) — run this after any change |
| `pnpm lint:client` | Type-check the web frontend (`tsc --noEmit -p apps/web/tsconfig.json`) |
| `pnpm lint:website` | Type-check the marketing website (`tsc --noEmit -p website/tsconfig.json`) |
| `pnpm website:dev` | Next.js dev server for the marketing website (`website/`) |
| `pnpm website:build` | Static-export the website (`next build website`) → `website/out/` |
| `pnpm website:preview` | Serve the built website locally (`website/out/`) |
| `pnpm test` | Run full Vitest suite (`vitest run`) |
| `pnpm test:watch` | Watch mode |
| `pnpm test:coverage` | Coverage report |
| `pnpm test:mutation` | Stryker mutation testing |
| `pnpm clear:memory` | Delete `core/memory/database.*` |

## Repository layout (quick map)

- `core/src/app.ts` — process entry point: wires DB, SessionManager, MessageGateway, channels, heartbeat, web server, TUI. Mode detection via argv flags.
- `core/src/onboard.ts`, `core/src/validate-settings.ts` — CLI entry points (`pnpm onboard`, `pnpm validate`).
- `core/src/config/` — loads `koris.json` into the typed `config` constant (`config/index.ts`). `config.BASE_DIR` is `process.cwd()`. Read-only; every module imports `config` directly.
- `core/src/constants/` — static prompt/agent text: main agent prompt, sub-agent prompts, thinking, TUI, command help.
- `core/src/entities/` — plain data types: `message`, `session`, `memory`, `heartbeat`.
- `core/src/types/` — TypeScript interfaces/typedefs (agents, chat, tools, workers, memory, etc.). Shared contracts live here.
- `core/src/infrastructure/` — `db-sqlite.ts` (SQLite wrapper + schema + factory) and `logger.ts` (Winston `LoggerFactory`).
- `core/src/repositories/` — data-access layer, one file per table/concern: `session`, `message`, `memory`, `skills`, `learned-skills`, `prompt` (builds LLM prompt payload), `context`, `heartbeat`, `tools`, `pre-prompt`. All return raw rows / typed records; SQL is written here, not in services.
- `core/src/services/` — business logic (see below).
- `core/src/channels/` — the channel runtime: `ChannelsManager`/`ChannelsSingleton`, the generic inbound pipeline (`handler.ts`), and response/utils helpers (`utils.ts`). It implements the channel contract from `plugins/channels/contracts.ts`.
- `core/src/dashboard/` — Express web server (`DashboardServerFactory`), port 3000: serves the built frontend from `dist-web/` and mounts `/api/chat` (SSE) + `/api/admin` (see `admin.ts`).
- `core/src/utils/` — pure helper functions (prompt replacement, curl, dates, telegram escaping, tool-call parsing, sanitize-log-text, etc.).
- `core/load/` — files injected into the agent's context at startup (e.g. `SOUL.md`).
- `core/memory/` — runtime SQLite database files (gitignored state).
- `core/temp/` — runtime scratch dir for generated files (heartbeat reports, etc.).
- `core/tests/` — Vitest suites: `unit/`, `integration/`, plus `helpers/test-config.ts` and `setup/vitest.setup.ts`.
- `apps/tui/` — terminal UI wrapper (flat module, one file per concern, co-located `*.test.ts`).
- `apps/web/` — the web frontend (React 19 SPA; see "Web frontend" below).
- `plugins/registry.ts` — the shared, family-agnostic plugin kernel (`ExtensionPoint`, `PluginRegistry`, `buildRegistry`) used by both `plugins/channels/` and `plugins/tools/`.
- `plugins/config/` — shared per-plugin `config.yml` helpers (`definePluginConfig`, loader, writer), parameterized by `family: 'channels' | 'tools'`. `plugins/channels/channel-config.ts` is a thin `family: 'channels'` preset wrapper over it.
- `plugins/channels/` — the channel plugin system with inverted dependencies. `contracts.ts` (the dependency-free plugin SDK: `PluginContext`, channel/gateway/logger interfaces, `ADAPTERS`, `splitMessage`) + one folder per channel plugin (`telegram/`, `whatsapp/`), each exposing `create(context)`.
- `plugins/tools/` — the AI-agent tool plugin system, same shape as `plugins/channels/`. `contracts.ts` (the dependency-free SDK: `ToolPluginContext`, `ToolDefinition`, `COMMANDS`) + one folder per tool (`curl-request/`, `set-beat/`, `list-beats/`, `update-beat/`, `delete-beat/`, `search-engine/`, `issue/`, `send-message/`, `learn-sticker/`, `send-sticker/`, `unlearn-sticker/`, `create-tool/`), each exposing `create(context): Plugin | null`. Shared helpers: `runtime.ts` (arg coercion, safe child-process exec), `cron.ts` (cron validation for the beat tools).
- `external/search/searxng/` — self-hosted SearXNG config/compose for the `search_engine` tool (`docker-compose.yml`, `settings.example.yml`).
- `skills/` — markdown skill definitions, one folder per skill with a `SKILL.md` (front-matter `name`/`description` + body). Synced into the `learned_skills` table at startup and on file changes by `core/src/services/skills/skill-sync.ts`.
- `website/` — the public marketing website, a statically-exported Next.js site (see "Website" below).
- `scripts/` — helper scripts (`init.ts`, `release.ts`, `run_search_engine.sh`, `scaffold-tool.ts` + `scaffold-tool-cli.ts` for `pnpm scaffold:tool`).
- `dist/` — build output (never edit).
- `dist-web/` — built web frontend (never edit).
- `website/out/` — built website (never edit).

## Core message flow (follow this to trace behavior)

1. A channel plugin (`plugins/channels/telegram`, `plugins/channels/whatsapp`, or `apps/tui`) receives a message, normalizes it into an `InboundChannelMessage`, and delegates to the generic `IChannelHandler` (injected via `PluginContext.channelHandler`, `core/src/channels/handler.ts`) which applies the channel rules (group-mention filter, trust-based tools/learned-skills gating, prompt prefixing, reply splitting) and calls `MessageGateway.handle(message, originId)`.
2. `core/src/services/agents/message-gateway.ts` resolves the session via `session-context.ts`, checks for commands (`/help` etc. via `core/src/services/commands/`), else delegates to the **MainAgent**. After the response, `background-dispatcher.ts` fires the persistence + summarization jobs.
3. `core/src/services/agents/main-agent.ts` passes the user message (the Tool Execution Contract lives in the system prompt via `TOOL_EXECUTION_CONTRACT`), calls `ChatService.complete()` (`core/src/services/chat/chat-service.ts`), which builds the full prompt via `PromptRepository.build()` and calls the AI provider.
4. If the LLM returns tool calls, MainAgent hands them to the **ToolCallPipeline** (`core/src/services/agents/tool-call-pipeline.ts`), which sends them to the **ExecutorWorker** (`core/src/services/workers/executor-worker.ts`) which loops tool-call → tool result → next LLM call until a final message.
5. `MessageGateway` (via `background-dispatcher.ts`) fires background jobs: `ConversationWorker` (`core/src/services/workers/conversation-worker.ts`) persists the exchange, and the **Summarizer** sub-agent (`core/src/services/agents/sub-agents/summarizer/`) may condense long context into memories.
6. Sub-agent execution loop keeps firing until terminal message or max iterations. Abort via `AbortController` passed in `ProcessOptions`.

## AI providers

- `core/src/services/providers/index.ts` — manifest registry + singleton `getAIProvider(logger)`. Each provider folder exports `providerManifest(): ProviderRegistration[]` (`manifest.ts`); `index.ts` combines the manifests it imports into a `Map<name, registration>`. `getSupportedProviders()`, `getProviderDefaultBaseUrl()`, `isOpenAICompatibleProvider()`, `resolveProviderBaseUrl()`, `getProviderCatalog()` all read that map, so onboarding (`core/src/onboard.ts`), the web setup wizard (`GET /api/admin/capabilities`), the **Providers page** (`GET /api/admin/providers` — catalogue with `label`/`apiKeyUrl`/`docsUrl`/`embeddings`/`recommendedModel` + the active per-role config), and `checkAiProviderConnectivity` (`core/src/config/validators.ts`) pick up new providers automatically. Provider display metadata + OpenRouter's `HTTP-Referer`/`X-Title` headers live on the preset rows in `openai-compatible/presets.ts`.
- Implementations: `ollama/index.ts` (native `/api/chat`), `mock/index.ts` (echo; forced under Vitest / unknown-provider fallback), `openai-compatible/index.ts` — one generic OpenAI Chat Completions client parameterised by `openai-compatible/presets.ts` (`openai`, `deepseek`, `groq`, `openrouter`, `xai`, `mistral`, `together`, `gemini`, `nvidia`; `nvidia` keeps the model-namespace 404 hint). All implement `AIProvider` (`core/src/types/chat.ts`).
- Config shape (`core/src/config/ai-config.ts`): `ai.providers[]` entries are `{ provider, base_url, api_token, num_ctx?, models[] }`; `ai.roles.<role>` is just `{ provider, model }` pointing at one of them; `ai.embedding` / `ai.embed_model` are AI-wide (not per-role). `resolveAiRoles` joins pointer→entry (num_ctx from the workers provider entry, embeddings from the AI-wide keys) into `config.AI.MANAGER` / `config.AI.WORKERS` (unchanged internal shape). A `base_url` left empty falls back to the provider's shipped `defaultBaseUrl` (`resolveProviderBaseUrl`). The legacy `ai.manager` / `ai.workers` objects (with per-role `num_ctx` / `embedding` / `embed_model`) are auto-migrated in memory (`hasLegacyAiShape` / `normalizeLegacyAi` — num_ctx onto the entry, embeddings to the AI-wide keys) and rewritten to disk on the next settings save; the web UI's per-role `POST /settings` patch (`{ai:{<role>:…}}`) is translated into an `ai.providers[]` upsert (`applyAiRolePatch`) so switching a role never drops another provider. Provider error strings must keep a `(NNN)` status token or a keyword (`aborted`, `timed out`, `missing content`, …) — `AICompletionService.mapError` parses them for retry / `AIErrorCode` classification (`aborted`, `timeout`, `authentication`, `rate_limited`, `unavailable`, `malformed_response`, `unknown`).
- `core/src/services/provider-health-service.ts` — health checks / timeouts for providers.
- Add an **OpenAI-compatible** service: one row in `openai-compatible/presets.ts`. Add a **native** provider: create `core/src/services/providers/<name>/index.ts` exporting `providerManifest()`, then add its import + array entry in `index.ts` (`PROVIDER_MANIFESTS`). Embeddings: providers without an `/embeddings` endpoint (e.g. `groq`, `xai`) throw from `embed()`; callers in `prompt.ts` / the summarizer catch + warn, so semantic memory silently degrades — point `ai.roles.workers` at an embeddings-capable provider and set `ai.embed_model`.

### Background sub-agent queueing

Two independent flags control how LLM calls are ordered:

- `ai.parallel` — **provider-level** (`core/src/services/providers/serial-queue.ts`). `false` → all LLM calls share one slot: interactive calls (`manager`, executor/learner workers) jump ahead of background (`worker:background` — summarizer, heartbeat), and background waits a grace period after the last interactive call. Queue snapshot labels use the calling agent (`manager`, `executorWorker`, `heartbeat`, `summarizer`, …) via `AIChatOptions.audit.agentName`. `true` (default) → the shared queue is bypassed and calls run concurrently (in-flight activity still tracked for the dashboard `/api/admin/queue`).
- `ai.subagents_parallel` — **sub-agent-level** (`core/src/services/sub-agents-queue/task-queue.ts`), independent of the above. `false` (default) → the `heartbeat` and `summarizer` share `sharedSubAgentQueue` (concurrency 1) so they never run simultaneously. `true` → each keeps its own concurrency-1 queue, so they may run at the same time but never concurrently within themselves.

`heartbeat`/`summarizer` never run their own tasks concurrently (no internal concurrency); the flags only change whether the two sub-agents share a queue or not. Note: when both `ai.parallel` and `ai.subagents_parallel` are `false`, the provider queue already serializes everything, making the sub-agent queue redundant for cross-agent ordering (it still guarantees within-agent ordering). Sub-agent queue state is exposed via `core/src/services/sub-agents-queue/sub-agent-queue-registry.ts` on the dashboard queue page.

## Tools

Tools are plugins under `plugins/tools/` — see "Plugins & skills" below for the full architecture. The pieces on the `core/src/` side are thin seam adapters, not the tool implementations:

- `core/src/services/tools/index.ts` — `AgnosticExecutionTool` dispatches a tool call by name-matching against `ToolPluginsSingleton.getExistingInstance()` (the collected `ToolDefinition[]`, populated once at boot — `core/src/services/tools/registry-singleton.ts`) and calling its `handler`.
- `core/src/repositories/tools.ts` — `ToolsRepository` turns that same collected `ToolDefinition[]` into the `AIToolDefinition[]` schema array sent to the AI provider, applying each definition's own `enabled(opts)` filter (trust, sticker-config, heartbeat-exclusion for beats — see `ToolFilterOptions` in `plugins/tools/contracts.ts`).
- `core/src/services/tools-queue/` — throttling/serialization of tool calls, unaffected by the plugin split.
- Tools: `curl_request`, `search_engine` (SearXNG is the active provider, self-hosted via `ai.searxng_url`; SerpAPI, `ai.search_api_key`, is kept in code as a fallback but currently inactivated via a code-level flag), `issue`, `set_beat`/`list_beats`/`update_beat`/`delete_beat`, `send_message`, `learn_sticker`/`send_sticker`/`unlearn_sticker`, and `create_tool` (scaffolds a new tool plugin from chat — disabled by default, REQUIRES CONFIRMATION, and never usable immediately since the plugin loader only discovers plugins at process startup). Each lives in its own `plugins/tools/<name>/` folder. On/off state is DB-backed (`plugin_settings` table, default `true` except `create_tool`, which defaults `false`) via the admin "Plugins" panel/setup-wizard step — see "Plugins & skills" below — not a `config.yml`.
- `pnpm scaffold:tool <name> --description "..."` (`scripts/scaffold-tool.ts`) generates a new `plugins/tools/<name>/` folder from a template — the same generator function the `create_tool` plugin calls into.

## Security

- `core/src/services/security/gate.ts` — domain allowlist gate for tools. `gateErrorForUrl(input)` returns an error string when a URL's hostname is not in `koris.json` `allowed_domains`, or `null` when permitted; `extractHostname(input)` parses and validates a hostname; `getAllowedDomains()` reads the configured allowlist. The `curl-request` plugin never imports it directly (plugins don't import `core/src/`) — `core/src/app.ts`'s `createToolPluginContext()` injects it as `context.security.gateUrl`.
- `plugins/tools/runtime.ts` — child-process execution helpers with output-size limits and no-shell `spawn`/`execFile` (structural defense against shell injection), shared by tool plugins.

## Workers & sub-agents

- `core/src/services/workers/` — `conversation-worker.ts`, `executor-worker.ts`. All implement the generic `IWorker<TArgs, TResult>` (`core/src/types/workers.ts`).
- `core/src/services/agents/` — `message-gateway.ts` (channel entry facade), `session-context.ts` (session + per-session message/memory services), `background-dispatcher.ts` (fire-and-forget persistence + summarization), `main-agent.ts` (main LLM orchestrator), `tool-call-pipeline.ts` (executor orchestration, shared with heartbeat), `sub-agents/` (`heartbeat/` scheduled beats: `runner.ts` schedules, `sub-agent.ts` runs the beat LLM, `default-beats.ts` syncs `heartbeats.default.json`; `summarizer/`).
- `core/src/services/skills/` — `skill-sync.ts` (`SkillSyncService` + `SkillSyncSingleton`): syncs `skills/` into `learned_skills` at startup and on file changes (fs.watch + 500ms debounce), pruning rows whose skill folder was removed.

## Plugins & skills (extension mechanisms)

- **Channel plugins** (`plugins/channels/`): the plugin SDK lives in `plugins/channels/contracts.ts` (dependency-free: `PluginContext`, `ChannelDefinition`, `ADAPTERS`, `ILogger`/`IMessageGateway`, channel-handler types, `splitMessage`), built on the shared kernel in `plugins/registry.ts`. Plugins never import from `core/src/` — the app injects concrete services via a `PluginContext` built in `core/src/app.ts` (`createPluginContext`) and passed to `createPlugins({ context })` → each plugin folder's `create(context): Plugin`. The scanner loads every subdirectory of `plugins/channels/` (`contracts.ts`, `channel-config.ts`, etc. are files, not dirs, so they're skipped). Channel plugins register a `ChannelDefinition` (`name`, `enabled`, `start`, optional `sendMessage`) on the `ADAPTERS` extension point in `setup(registry)`. Add/remove a channel by adding/removing a folder under `plugins/channels/` — no core changes needed.
- **Tool plugins** (`plugins/tools/`): the same architecture applied to the AI agent's tools, on the same shared kernel. SDK in `plugins/tools/contracts.ts` (dependency-free: `ToolPluginContext`, `ToolDefinition`, `ToolHandler`, `ToolFilterOptions`, the `COMMANDS` extension point, and narrow per-concern gateways — `IHeartbeatGateway`, `IChannelsGateway`, `IStickerRulesGateway`, `security.gateUrl`, `config`, `pluginEnablement`). `core/src/app.ts`'s `createToolPluginContext()` is the composition root, adapting concrete core services (heartbeat repo + `HeartbeatSingleton`, `ChannelsSingleton` + `OutboundMessageService`, sticker-rules repo, `gateErrorForUrl`, `config.AI`/`config.GITHUB`) into that narrow context; `createToolPlugins({ context })` scans `plugins/tools/`'s subdirectories the same way `createPlugins` scans `plugins/channels/`. `core/src/app.ts` builds **one shared `PluginRegistry`** from both families (`buildRegistry([...channelPlugins, ...toolPlugins])`) and stores the collected `ToolDefinition[]` in `ToolPluginsSingleton` (`core/src/services/tools/registry-singleton.ts`) once at boot — `ToolsQueue`/`ToolsRepository`/the heartbeat sub-agent are constructed per-message deep in the call graph, not once at startup, so they read the singleton rather than taking a registry parameter. Add a tool by adding a folder under `plugins/tools/` (or `pnpm scaffold:tool <name> --description "..."`) — no core changes needed; each folder owns its LLM-facing schema and handler, fixing the pre-plugin design where a tool's schema (`core/src/repositories/tools.ts`) and its dispatcher entry (`core/src/services/tools/index.ts`'s `COMMAND_MAP`) were two hand-typed strings in unrelated files with no compiler-enforced link.
- **Plugin on/off state** (`core/src/services/plugins/plugin-enablement.ts`, `core/src/repositories/plugin-settings.ts`): every tool and channel plugin's enabled/disabled state lives in the DB-backed `plugin_settings` table, not in a per-plugin `config.yml` — `resolvePluginEnabled(repo, family, name)` reads the DB row, falling back to a code-level default (`defaultPluginEnabled`) when no row exists yet. Both `ToolPluginContext`/`PluginContext` inject a narrow `pluginEnablement: { isEnabled(name) }` gateway; each plugin's `enabled(opts)` closure (tools) or `ChannelDefinition.enabled()` (channels) checks it, so toggling is live — no restart needed, unlike the old `config.yml`-based `enabled` flag which was baked into `ToolPluginsSingleton` at boot. `PluginCatalogSingleton` (`core/src/services/plugins/plugin-catalog-singleton.ts`) holds every registered `{family, name}` for the admin API to list without rescanning disk. A one-time `migrateLegacyPluginEnabledFlags()` boot step seeds the DB from any pre-existing `config.yml`'s `enabled` key, for upgrading installs. Web UI: the admin "Plugins" panel (`apps/web/src/pages/admin/PluginsModal.tsx`) and the setup wizard's "Plugins" step (`apps/web/src/pages/setup/steps/PluginsStep.tsx`) both list every plugin with a toggle, via `GET /api/admin/plugins` / `PATCH /api/admin/plugins/:family/:name`. Channel plugins' `config.yml` still holds secrets (`bot_token`, `whitelist`, etc.) — only `enabled` moved to the DB.
- **Skills** (`skills/`): markdown files synced into the `learned_skills` table at startup and on file changes by `SkillSyncService` (`core/src/services/skills/skill-sync.ts`), which wraps each `SKILL.md` body in `SKILL_LEARNING_PROMPT` (with `<GATEWAY_HOST>` resolved to `config.GATEWAY_HOST`) and prunes rows whose folder was removed. To add a skill, add a `skills/<name>/SKILL.md` with front-matter + body.

## Database schema (`core/src/infrastructure/db-sqlite.ts`)

Tables: `heartbeat`, `sessions`, `memories` (long-term; `type` in summary/fact/lesson/reminder), `messages` (short-term, `role` in user/assistant/system), `images`, `learned_skills`, `plugin_settings` (`family`/`name`/`enabled`, PK `(family, name)` — DB-backed on/off state for every tool and channel plugin, see "Plugins & skills" below). Foreign keys cascade on `session_id`. Access **only** through `core/src/repositories/*`. `DatabaseServiceFactory.create()` is safe to call many times (multiple instances share one DB file; init is reported once).

## Default heartbeats (`core/heartbeats.default.json`)

`core/heartbeats.default.json` defines the beats seeded into the `heartbeat` table on every startup by `seedDefaultBeats()` (`core/src/services/agents/sub-agents/heartbeat/default-beats.ts`, called from `app.ts`). Entries are `{ beat, type, cron_expression, channel?, target? }`. Config-owned beats are marked `managed=1` and fully synced (updated, or pruned when removed from the file); beats created via the `set_beat` tool or dashboard are never touched. The reserved `__koris_clear_images__` beat is handled natively by the heartbeat sub-agent (no LLM call) — it empties the `images` table. `images` holds base64 attachments by uuid id; `messages.image_ids` stores the ids.

## Web frontend

- The browser UI is a React 19 SPA (Vite, React Router, Tailwind v4) in `apps/web/`; the server side is the Express dashboard in `core/src/dashboard/`. `core/src/dashboard/index.ts` serves the built bundle from `dist-web/` and ends with an SPA fallback that returns `index.html` for any unmatched GET so React Router owns routing.
- Trace path: `apps/web/index.html` (`#root`) → `apps/web/src/main.tsx` (BrowserRouter) → `apps/web/src/App.tsx` (`/` redirects to `/admin`) → `apps/web/src/pages/admin/AdminLayout.tsx` (sidebar + nested routes) → per-page components in `apps/web/src/pages/admin/`. Shared UI lives in `apps/web/src/components/AdminUI.tsx`.
- `apps/web/src/lib/api.ts` — `streamChat()` consumes the `/api/chat` SSE stream (`progress` status + `content_block_delta` text events); `apiRequest()` calls `/api/admin/*`; `checkHealth()` polls `/health`. `apps/web/src/lib/markdown.ts` + `types.ts` handle rendering and response types.
- `apps/web/src/lib/chat-context.tsx` — `ChatProvider`/`useChat` hold conversation state, hydrate prior history from `/api/admin/chat/history`, stream replies, and poll server health every 5s. Chats are sessions; `POST /api/admin/sessions` creates a new one without ending the previous, `/api/chat` accepts an optional `sessionId` to route messages to a specific session (`gateway.handle(message, 'web', { sessionId })`, `core/src/dashboard/index.ts:104`).
- Admin API: `core/src/dashboard/admin.ts` (`AdminRouterFactory`, mounted at `/api/admin`) — overview, sessions, memories, chat history, heartbeats (create/update/delete with cron validation), skills (list merged disk+learned, `PATCH /skills/:name` enable/disable, `POST /skills/sync`), settings, `GET /providers` + `POST /ai/test-connection` (the Providers page — `apps/web/src/pages/admin/ProvidersPage.tsx` + `use-providers.ts`; activating a provider is a partial `POST /settings` `{ai:{<role>:…}}`). Settings are deep-masked for secrets (`BOT_TOKEN`, `API_TOKEN`, `SEARCH_API_KEY`).
- Build `pnpm build:client` → `dist-web/` (root/outDir in `vite.config.mts`); dev `pnpm dev:client` on port 5173 proxies `/api` and `/health` to `localhost:3000`; type-check via `pnpm lint:client` (`apps/web/tsconfig.json`).

## Website

- `website/` is a standalone Next.js (App Router) site, statically exported (`output: 'export'` in `website/next.config.ts`, no Node server needed) that is the public marketing page deployed to GitHub Pages. It shares the repo's root `node_modules`/`pnpm` install (`next` is a root dependency, styled with Tailwind v4 via `@tailwindcss/postcss`); there's no separate `package.json` here (single-package pnpm workspace).
- `website/next.config.ts` sets `basePath: '/koris'` for the GitHub Pages project URL (`https://guilhermesalviano.github.io/koris`) and `images.unoptimized: true` (required for static export). Build output always lands in `website/out/` (Next forbids `distDir` escaping the project directory), kept separate from `dist/` and `dist-web/`.
- Structure: `website/src/app/page.tsx` (the page) → `website/src/app/layout.tsx` (shared `<head>`/font) + `website/src/app/globals.css` (Tailwind `@theme` tokens for the page's own dark/teal palette — intentionally distinct from `apps/web/src/index.css`'s orange dashboard theme) + `website/src/components/` (`Hero`, `Feature`, `Footer`, `icons`).
- Commands: `pnpm website:dev` (dev server), `pnpm website:build` (static export → `website/out/`), `pnpm website:preview` (serves `website/out/` via `pnpm dlx serve`), `pnpm lint:website` (type-check). `.github/workflows/deploy-website.yml` (manual `workflow_dispatch`, triggers on `website/**`) installs deps, runs `pnpm run website:build`, and publishes `website/out` to the `gh-pages` branch via `peaceiris/actions-gh-pages`.

## Conventions to follow

- **Interfaces prefixed `I`** (`IMessageGateway`, `ILogger`, `IChatService`); implementations are classes; creation is via `XxxFactory.create()` and singletons via `XxxSingleton.getInstance()`.
- **Dependency inversion for plugins**: a plugin imports **only** from its own family's SDK (`plugins/channels/contracts.ts` or `plugins/tools/contracts.ts`) and the shared `plugins/registry.ts` — never from `core/src/`, and never from the other family's `contracts.ts`. Core depends on the SDKs too (via re-export shims like `core/src/infrastructure/logger.ts` and `core/src/channels/`), and injects concrete services through `PluginContext`/`ToolPluginContext` at the composition root (`core/src/app.ts`). The one documented exception is `plugins/tools/create-tool/`, which reaches into `scripts/scaffold-tool.ts` to scaffold new tool plugins — noted in that file's own top comment.
- **No code comments** in source files unless asked. Code should be self-explanatory.
- **Relative imports only** (the `@` alias exists only in Vitest config, not tsconfig — tests can use `@/`, source should not).
- Config values come from the `config` object, never hard-coded secrets or paths.
- Logging via `LoggerFactory.create()` / `ILogger` (Winston). Note `app.ts` sets `LOG_SILENCE_CONSOLE` before importing anything when `--tui` is used — keep that ordering when touching logging.
- Strict TS: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` are on. `pnpm lint` must pass.
- Use `pnpm build` before `pnpm app`; `dist/` is gitignored build output.

## Testing

- Unit tests: `core/tests/unit/**`, mirroring `core/src/` structure. Integration: `core/tests/integration/`. Everything under `plugins/` (`plugins/channels/`, `plugins/tools/`) instead colocates each `*.test.ts` next to the file it tests (e.g. `plugins/tools/curl-request/index.test.ts`) — don't look for those under `core/tests/`.
- Run `pnpm test` and `pnpm lint` before considering a change done. Vitest suppresses `console.log` output (see `vitest.config.ts`).
- `core/tests/helpers/test-config.ts` provides a test settings fixture; `core/tests/setup/vitest.setup.ts` runs globally.
- Mutation testing config in `stryker.config.json`.
