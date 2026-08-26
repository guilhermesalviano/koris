# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

`koris` is an autonomous AI agent framework written in TypeScript (CommonJS, strict mode). It receives messages through pluggable channels (Telegram, WhatsApp, TUI, web dashboard), runs them through an LLM, and can execute tools (`curl`, search, beats, issue tracking, sticker learning, learned-skills instructions). It has persistent SQLite memory, session tracking, heartbeat (scheduled) agents, and a summarizer sub-agent.

## Tech stack & package manager

- **Package manager:** `pnpm` (`pnpm@10.18.3`, single-package workspace). Never use `npm`/`yarn`.
- **Runtime:** Node >= 24. **Build:** `tsc` → `dist/`. No bundler.
- **Database:** `better-sqlite3` (synchronous, WAL). DB file lives in `core/memory/database.db`.
- **LLM providers:** Ollama, NVIDIA, Mock — selected per role via `koris.json` (`ai.manager.provider` for the main agent, `ai.workers.provider` for workers/summarizer/heartbeat).
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
- `plugins/channels/` — the plugin system with inverted dependencies. `registry.ts` (ExtensionPoint/PluginRegistry) + `contracts.ts` (the dependency-free plugin SDK: `PluginContext`, channel/gateway/logger interfaces, `ADAPTERS`, `splitMessage`) + one folder per channel plugin (`telegram/`, `whatsapp/`), each exposing `create(context)`.
- `external/search/searxng/` — self-hosted SearXNG config/compose for the `search_engine` tool (`docker-compose.yml`, `settings.example.yml`).
- `skills/` — markdown skill definitions, one folder per skill with a `SKILL.md` (front-matter `name`/`description` + body). Synced into the `learned_skills` table at startup and on file changes by `core/src/services/skills/skill-sync.ts`.
- `website/` — the public marketing website, a statically-exported Next.js site (see "Website" below).
- `scripts/` — helper scripts (`init.ts`, `release.ts`, `run_search_engine.sh`).
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

- `core/src/services/providers/index.ts` — factory registry + singleton `getAIProvider(logger)`.
- Implementations: `ollama/index.ts`, `nvidia/index.ts`, `mock/index.ts`. Implement `AIProvider` (`core/src/types/chat.ts`).
- `core/src/services/ai-completion-service.ts` wraps a provider and maps errors to typed `AIErrorCode`s (`aborted`, `timeout`, `authentication`, `rate_limited`, `unavailable`, `malformed_response`, `unknown`).
- `core/src/services/provider-health-service.ts` — health checks / timeouts for providers.
- Add a new provider: create `core/src/services/providers/<name>/index.ts`, register it in the `PROVIDER_FACTORIES` map.

### Background sub-agent queueing

Two independent flags control how LLM calls are ordered:

- `ai.parallel` — **provider-level** (`core/src/services/providers/serial-queue.ts`). `false` → all LLM calls share one slot: interactive calls (`manager`, executor/learner workers) jump ahead of background (`worker:background` — summarizer, heartbeat), and background waits a grace period after the last interactive call. Queue snapshot labels use the calling agent (`manager`, `executorWorker`, `heartbeat`, `summarizer`, …) via `AIChatOptions.audit.agentName`. `true` (default) → the shared queue is bypassed and calls run concurrently (in-flight activity still tracked for the dashboard `/api/admin/queue`).
- `ai.subagents_parallel` — **sub-agent-level** (`core/src/services/sub-agents-queue/task-queue.ts`), independent of the above. `false` (default) → the `heartbeat` and `summarizer` share `sharedSubAgentQueue` (concurrency 1) so they never run simultaneously. `true` → each keeps its own concurrency-1 queue, so they may run at the same time but never concurrently within themselves.

`heartbeat`/`summarizer` never run their own tasks concurrently (no internal concurrency); the flags only change whether the two sub-agents share a queue or not. Note: when both `ai.parallel` and `ai.subagents_parallel` are `false`, the provider queue already serializes everything, making the sub-agent queue redundant for cross-agent ordering (it still guarantees within-agent ordering). Sub-agent queue state is exposed via `core/src/services/sub-agents-queue/sub-agent-queue-registry.ts` on the dashboard queue page.

## Tools

- Tool registry: `core/src/services/tools/index.ts` — `AgnosticExecutionTool` dispatches tool name → handler via `COMMAND_MAP`.
- Tools: `curl_request` (`curl-request/`, respects `allowed_domains` in settings), `search_engine` (`search/` — `index.ts` orchestrates: SearXNG is the active provider (`searxng.ts`, self-hosted, `ai.searxng_url`), SerpAPI (`serpapi.ts`, `ai.search_api_key`) is kept as a fallback but is currently inactivated via a code-level flag), `issue` (`issue/`), `set_beat`/`list_beats`/`update_beat`/`delete_beat` (`beats/*`), `send_message` (`send-message/`), `learn_sticker`/`send_sticker`/`unlearn_sticker` (`learn-sticker/`, `send-sticker/`, `unlearn-sticker/`). Shared helper: `core/src/services/tools/runtime.ts`.
- `core/src/services/tools-queue/` — throttling/serialization of tool calls.

## Security

- `core/src/services/security/gate.ts` — domain allowlist gate for tools. `gateErrorForUrl(input)` returns an error string when a URL's hostname is not in `koris.json` `allowed_domains`, or `null` when permitted; `extractHostname(input)` parses and validates a hostname; `getAllowedDomains()` reads the configured allowlist. Used by `curl-request` to block requests outside the allowlist.
- `core/src/services/tools/runtime.ts` — child-process execution helpers with output-size limits and no-shell `spawn`/`execFile` (structural defense against shell injection).

## Workers & sub-agents

- `core/src/services/workers/` — `conversation-worker.ts`, `executor-worker.ts`. All implement the generic `IWorker<TArgs, TResult>` (`core/src/types/workers.ts`).
- `core/src/services/agents/` — `message-gateway.ts` (channel entry facade), `session-context.ts` (session + per-session message/memory services), `background-dispatcher.ts` (fire-and-forget persistence + summarization), `main-agent.ts` (main LLM orchestrator), `tool-call-pipeline.ts` (executor orchestration, shared with heartbeat), `sub-agents/` (`heartbeat/` scheduled beats: `runner.ts` schedules, `sub-agent.ts` runs the beat LLM, `default-beats.ts` syncs `heartbeats.default.json`; `summarizer/`).
- `core/src/services/skills/` — `skill-sync.ts` (`SkillSyncService` + `SkillSyncSingleton`): syncs `skills/` into `learned_skills` at startup and on file changes (fs.watch + 500ms debounce), pruning rows whose skill folder was removed.

## Plugins & skills (extension mechanisms)

- **Plugins** (`plugins/channels/`): the plugin SDK lives in `plugins/channels/contracts.ts` (dependency-free: `PluginContext`, `ChannelDefinition`, `ADAPTERS`, `ILogger`/`IMessageGateway`, channel-handler types, `splitMessage`). Plugins never import from `core/src/` — the app injects concrete services via a `PluginContext` built in `core/src/app.ts` (`createPluginContext`) and passed to `createPlugins({ context })` → each plugin folder's `create(context): Plugin | null`. The scanner loads every subdirectory of `plugins/channels/` (contract/registry are files, not dirs, so they're skipped). Channel plugins register a `ChannelDefinition` (`name`, `enabled`, `start`, optional `sendMessage`) on the `ADAPTERS` extension point in `setup(registry)`. Add/remove a channel by adding/removing a folder under `plugins/channels/` — no core changes needed.
- **Skills** (`skills/`): markdown files synced into the `learned_skills` table at startup and on file changes by `SkillSyncService` (`core/src/services/skills/skill-sync.ts`), which wraps each `SKILL.md` body in `SKILL_LEARNING_PROMPT` (with `<GATEWAY_HOST>` resolved to `config.GATEWAY_HOST`) and prunes rows whose folder was removed. To add a skill, add a `skills/<name>/SKILL.md` with front-matter + body.

## Database schema (`core/src/infrastructure/db-sqlite.ts`)

Tables: `heartbeat`, `sessions`, `memories` (long-term; `type` in summary/fact/lesson/reminder), `messages` (short-term, `role` in user/assistant/system), `images`, `learned_skills`. Foreign keys cascade on `session_id`. Access **only** through `core/src/repositories/*`. `DatabaseServiceFactory.create()` is safe to call many times (multiple instances share one DB file; init is reported once).

## Default heartbeats (`core/heartbeats.default.json`)

`core/heartbeats.default.json` defines the beats seeded into the `heartbeat` table on every startup by `seedDefaultBeats()` (`core/src/services/agents/sub-agents/heartbeat/default-beats.ts`, called from `app.ts`). Entries are `{ beat, type, cron_expression, channel?, target? }`. Config-owned beats are marked `managed=1` and fully synced (updated, or pruned when removed from the file); beats created via the `set_beat` tool or dashboard are never touched. The reserved `__koris_clear_images__` beat is handled natively by the heartbeat sub-agent (no LLM call) — it empties the `images` table. `images` holds base64 attachments by uuid id; `messages.image_ids` stores the ids.

## Web frontend

- The browser UI is a React 19 SPA (Vite, React Router, Tailwind v4) in `apps/web/`; the server side is the Express dashboard in `core/src/dashboard/`. `core/src/dashboard/index.ts` serves the built bundle from `dist-web/` and ends with an SPA fallback that returns `index.html` for any unmatched GET so React Router owns routing.
- Trace path: `apps/web/index.html` (`#root`) → `apps/web/src/main.tsx` (BrowserRouter) → `apps/web/src/App.tsx` (`/` redirects to `/admin`) → `apps/web/src/pages/admin/AdminLayout.tsx` (sidebar + nested routes) → per-page components in `apps/web/src/pages/admin/`. Shared UI lives in `apps/web/src/components/AdminUI.tsx`.
- `apps/web/src/lib/api.ts` — `streamChat()` consumes the `/api/chat` SSE stream (`progress` status + `content_block_delta` text events); `apiRequest()` calls `/api/admin/*`; `checkHealth()` polls `/health`. `apps/web/src/lib/markdown.ts` + `types.ts` handle rendering and response types.
- `apps/web/src/lib/chat-context.tsx` — `ChatProvider`/`useChat` hold conversation state, hydrate prior history from `/api/admin/chat/history`, stream replies, and poll server health every 5s. Chats are sessions; `POST /api/admin/sessions` creates a new one without ending the previous, `/api/chat` accepts an optional `sessionId` to route messages to a specific session (`gateway.handle(message, 'web', { sessionId })`, `core/src/dashboard/index.ts:104`).
- Admin API: `core/src/dashboard/admin.ts` (`AdminRouterFactory`, mounted at `/api/admin`) — overview, sessions, memories, chat history, heartbeats (create/update/delete with cron validation), skills (list merged disk+learned, `PATCH /skills/:name` enable/disable, `POST /skills/sync`), settings. Settings are deep-masked for secrets (`BOT_TOKEN`, `API_TOKEN`, `SEARCH_API_KEY`).
- Build `pnpm build:client` → `dist-web/` (root/outDir in `vite.config.mts`); dev `pnpm dev:client` on port 5173 proxies `/api` and `/health` to `localhost:3000`; type-check via `pnpm lint:client` (`apps/web/tsconfig.json`).

## Website

- `website/` is a standalone Next.js (App Router) site, statically exported (`output: 'export'` in `website/next.config.ts`, no Node server needed) that is the public marketing page deployed to GitHub Pages. It shares the repo's root `node_modules`/`pnpm` install (`next` is a root dependency, styled with Tailwind v4 via `@tailwindcss/postcss`); there's no separate `package.json` here (single-package pnpm workspace).
- `website/next.config.ts` sets `basePath: '/koris'` for the GitHub Pages project URL (`https://guilhermesalviano.github.io/koris`) and `images.unoptimized: true` (required for static export). Build output always lands in `website/out/` (Next forbids `distDir` escaping the project directory), kept separate from `dist/` and `dist-web/`.
- Structure: `website/src/app/page.tsx` (the page) → `website/src/app/layout.tsx` (shared `<head>`/font) + `website/src/app/globals.css` (Tailwind `@theme` tokens for the page's own dark/teal palette — intentionally distinct from `apps/web/src/index.css`'s orange dashboard theme) + `website/src/components/` (`Hero`, `Feature`, `Footer`, `icons`).
- Commands: `pnpm website:dev` (dev server), `pnpm website:build` (static export → `website/out/`), `pnpm website:preview` (serves `website/out/` via `pnpm dlx serve`), `pnpm lint:website` (type-check). `.github/workflows/deploy-website.yml` (manual `workflow_dispatch`, triggers on `website/**`) installs deps, runs `pnpm run website:build`, and publishes `website/out` to the `gh-pages` branch via `peaceiris/actions-gh-pages`.

## Conventions to follow

- **Interfaces prefixed `I`** (`IMessageGateway`, `ILogger`, `IChatService`); implementations are classes; creation is via `XxxFactory.create()` and singletons via `XxxSingleton.getInstance()`.
- **Dependency inversion for plugins**: plugins import **only** from `plugins/channels/contracts.ts` (the SDK) and `plugins/channels/registry.ts` — never from `core/src/`. Core depends on the SDK too (via re-export shims like `core/src/infrastructure/logger.ts` and `core/src/channels/`), and injects concrete services through `PluginContext` at the composition root (`core/src/app.ts`).
- **No code comments** in source files unless asked. Code should be self-explanatory.
- **Relative imports only** (the `@` alias exists only in Vitest config, not tsconfig — tests can use `@/`, source should not).
- Config values come from the `config` object, never hard-coded secrets or paths.
- Logging via `LoggerFactory.create()` / `ILogger` (Winston). Note `app.ts` sets `LOG_SILENCE_CONSOLE` before importing anything when `--tui` is used — keep that ordering when touching logging.
- Strict TS: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` are on. `pnpm lint` must pass.
- Use `pnpm build` before `pnpm app`; `dist/` is gitignored build output.

## Testing

- Unit tests: `core/tests/unit/**`, mirroring `core/src/` structure. Integration: `core/tests/integration/`.
- Run `pnpm test` and `pnpm lint` before considering a change done. Vitest suppresses `console.log` output (see `vitest.config.ts`).
- `core/tests/helpers/test-config.ts` provides a test settings fixture; `core/tests/setup/vitest.setup.ts` runs globally.
- Mutation testing config in `stryker.config.json`.
