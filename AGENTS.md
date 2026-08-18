# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

`koris-assistant` is an autonomous AI agent framework written in TypeScript (CommonJS, strict mode). It receives messages through pluggable channels (Telegram, WhatsApp, TUI, web dashboard), runs them through an LLM, and can execute tools (`curl`, some shell commands, search, beats, skills instructions). It has persistent SQLite memory, session tracking, heartbeat (scheduled) agents, and a summarizer sub-agent.

## Tech stack & package manager

- **Package manager:** `pnpm` (`pnpm@10.18.3`, single-package workspace). Never use `npm`/`yarn`.
- **Runtime:** Node >= 24. **Build:** `tsc` → `dist/`. No bundler.
- **Database:** `better-sqlite3` (synchronous, WAL). DB file lives in `memory/database.db`.
- **LLM providers:** Ollama, NVIDIA, Mock — selected per role via `settings.json` (`ai.manager.provider` for the main agent, `ai.workers.provider` for workers/summarizer/heartbeat).
- **Testing:** Vitest (globals enabled, `@` alias → `src`). Mutation testing via Stryker.
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
| `pnpm validate` | Validate `settings.json` against expected schema |
| `pnpm lint` | Type-check server (`tsc --noEmit`) — run this after any change |
| `pnpm lint:client` | Type-check the web frontend (`tsc --noEmit -p web/tsconfig.json`) |
| `pnpm test` | Run full Vitest suite (`vitest run`) |
| `pnpm test:watch` | Watch mode |
| `pnpm test:coverage` | Coverage report |
| `pnpm test:mutation` | Stryker mutation testing |
| `pnpm clear:memory` | Delete `memory/database.*` |

## Repository layout (quick map)

- `src/app.ts` — process entry point: wires DB, SessionManager, MessageGateway, channels, heartbeat, web server, TUI. Mode detection via argv flags.
- `src/onboard.ts`, `src/validate-settings.ts` — CLI entry points (`pnpm onboard`, `pnpm validate`).
- `src/config/` — loads `settings.json` into the typed `config` constant (`config/index.ts`). `config.BASE_DIR` is `process.cwd()`. Read-only; every module imports `config` directly.
- `src/constants/` — static prompt/agent text: main agent prompt, sub-agent prompts, thinking, TUI, command help.
- `src/entities/` — plain data types: `message`, `session`, `memory`, `heartbeat`.
- `src/types/` — TypeScript interfaces/typedefs (agents, chat, tools, workers, memory, etc.). Shared contracts live here.
- `src/infrastructure/` — `db-sqlite.ts` (SQLite wrapper + schema + factory) and `logger.ts` (Winston `LoggerFactory`).
- `src/repositories/` — data-access layer, one file per table/concern: `session`, `message`, `memory`, `skills`, `learned-skills`, `prompt` (builds LLM prompt payload), `context`, `heartbeat`, `tools`, `pre-prompt`. All return raw rows / typed records; SQL is written here, not in services.
- `src/services/` — business logic (see below).
- `src/channels/` — `ChannelDefinition` contract + `ChannelsManager`/`ChannelsSingleton` and the `ADAPTERS` extension point.
- `src/dashboard/` — Express web server (`DashboardServerFactory`), port 3000: serves the built frontend from `dist-web/` and mounts `/api/chat` (SSE) + `/api/admin` (see `admin.ts`).
- `src/tui/` — terminal UI wrapper.
- `src/utils/` — pure helper functions (prompt replacement, curl, dates, telegram escaping, tool-call parsing, sanitize-log-text, etc.).
- `plugins/` — the plugin system: `registry.ts` (ExtensionPoint/PluginRegistry) + one folder per channel plugin (`telegram/`, `whatsapp/`), each exposing `create()`.
- `skills/` — markdown skill definitions, one folder per skill with a `SKILL.md` (front-matter `name`/`description` + body). Synced into the `learned_skills` table at startup and on file changes by `src/services/skills/skill-sync.ts`.
- `memory/` — runtime SQLite database files (gitignored state).
- `temp/` — runtime scratch dir for generated files (heartbeat reports, etc.).
- `scripts/` — helper scripts (`init.ts`).
- `tests/` — Vitest suites: `unit/`, `integration/`, plus `helpers/test-config.ts` and `setup/vitest.setup.ts`.
- `web/` — the web frontend (React 19 SPA; see "Web frontend" below).
- `dist/` — build output (never edit).
- `dist-web/` — built web frontend (never edit).

## Core message flow (follow this to trace behavior)

1. A channel plugin (`plugins/telegram`, `plugins/whatsapp`, or `src/tui`) calls `MessageGateway.handle(message, originId)`.
2. `src/services/agents/message-gateway.ts` resolves the session via `session-context.ts`, checks for commands (`/help` etc. via `src/services/commands/`), else delegates to the **MainAgent**. After the response, `background-dispatcher.ts` fires the persistence + summarization jobs.
3. `src/services/agents/main-agent.ts` passes the user message (the Tool Execution Contract lives in the system prompt via `TOOL_EXECUTION_CONTRACT`), calls `ChatService.complete()` (`src/services/chat/chat-service.ts`), which builds the full prompt via `PromptRepository.build()` and calls the AI provider.
4. If the LLM returns tool calls, MainAgent hands them to the **ToolCallPipeline** (`src/services/agents/tool-call-pipeline.ts`), which sends them to the **ExecutorWorker** (`src/services/workers/executor-worker.ts`) which loops tool-call → tool result → next LLM call until a final message.
5. `MessageGateway` (via `background-dispatcher.ts`) fires background jobs: `ConversationWorker` (`src/services/workers/conversation-worker.ts`) persists the exchange, and the **Summarizer** sub-agent (`src/services/agents/sub-agents/summarizer/`) may condense long context into memories.
6. Sub-agent execution loop keeps firing until terminal message or max iterations. Abort via `AbortController` passed in `ProcessOptions`.

## AI providers

- `src/services/providers/index.ts` — factory registry + singleton `getAIProvider(logger)`.
- Implementations: `ollama/index.ts`, `nvidia/index.ts`, `mock/index.ts`. Implement `AIProvider` (`src/types/chat.ts`).
- `src/services/ai-completion-service.ts` wraps a provider and maps errors to typed `AIErrorCode`s (`aborted`, `timeout`, `authentication`, `rate_limited`, `unavailable`, `malformed_response`, `unknown`).
- `src/services/provider-health-service.ts` — health checks / timeouts for providers.
- Add a new provider: create `src/services/providers/<name>/index.ts`, register it in the `PROVIDER_FACTORIES` map.

### Background sub-agent queueing

Two independent flags control how LLM calls are ordered:

- `ai.parallel` — **provider-level** (`src/services/providers/serial-queue.ts`). `false` → all LLM calls share one slot: interactive calls (`manager`, executor/learner workers) jump ahead of background (`worker:background` — summarizer, heartbeat), and background waits a grace period after the last interactive call. Queue snapshot labels use the calling agent (`manager`, `executorWorker`, `heartbeat`, `summarizer`, …) via `AIChatOptions.audit.agentName`. `true` (default) → the shared queue is bypassed and calls run concurrently (in-flight activity still tracked for the dashboard `/api/admin/queue`).
- `ai.subagents_parallel` — **sub-agent-level** (`src/services/sub-agents-queue/task-queue.ts`), independent of the above. `false` (default) → the `heartbeat` and `summarizer` share `sharedSubAgentQueue` (concurrency 1) so they never run simultaneously. `true` → each keeps its own concurrency-1 queue, so they may run at the same time but never concurrently within themselves.

`heartbeat`/`summarizer` never run their own tasks concurrently (no internal concurrency); the flags only change whether the two sub-agents share a queue or not. Note: when both `ai.parallel` and `ai.subagents_parallel` are `false`, the provider queue already serializes everything, making the sub-agent queue redundant for cross-agent ordering (it still guarantees within-agent ordering). Sub-agent queue state is exposed via `src/services/sub-agents-queue/sub-agent-queue-registry.ts` on the dashboard queue page.

## Tools

- Tool registry: `src/services/tools/index.ts` — `AgnosticExecutionTool` dispatches tool name → handler via `COMMAND_MAP`.
- Tools: `execute-command`, `curl-request` (respects `allowed_domains` in settings), `search` (SerpAPI), `beats/*` (create/list/update/delete recurring beats). Shared helper: `src/services/tools/runtime.ts`.
- `src/services/tools-queue/` — throttling/serialization of tool calls.

## Security

- `src/services/security/gate.ts` — domain allowlist gate for tools. `gateErrorForUrl(input)` returns an error string when a URL's hostname is not in `settings.json` `allowed_domains`, or `null` when permitted; `extractHostname(input)` parses and validates a hostname; `getAllowedDomains()` reads the configured allowlist. Used by `curl-request` to block requests outside the allowlist.
- `src/services/tools/runtime.ts` — child-process execution helpers with output-size limits and no-shell `spawn`/`execFile` (structural defense against shell injection).

## Workers & sub-agents

- `src/services/workers/` — `conversation-worker.ts`, `executor-worker.ts`. All implement the generic `IWorker<TArgs, TResult>` (`src/types/workers.ts`).
- `src/services/agents/` — `message-gateway.ts` (channel entry facade), `session-context.ts` (session + per-session message/memory services), `background-dispatcher.ts` (fire-and-forget persistence + summarization), `main-agent.ts` (main LLM orchestrator), `tool-call-pipeline.ts` (executor orchestration, shared with heartbeat), `sub-agents/` (`heartbeat/` scheduled beats: `runner.ts` schedules, `sub-agent.ts` runs the beat LLM, `default-beats.ts` syncs `heartbeats.default.json`; `summarizer/`).
- `src/services/skills/` — `skill-sync.ts` (`SkillSyncService` + `SkillSyncSingleton`): syncs `skills/` into `learned_skills` at startup and on file changes (fs.watch + 500ms debounce), pruning rows whose skill folder was removed.

## Plugins & skills (extension mechanisms)

- **Plugins** (`plugins/`): a plugin is a folder exposing `create(): Plugin | null`. `createPlugins()` scans the dir, `buildRegistry()` calls each `setup(registry)`. Channel plugins extend `ADAPTERS` (from `src/channels`) with a `ChannelDefinition` (`name`, `enabled`, `start`, optional `sendMessage`). Add a new channel by adding a folder under `plugins/`.
- **Skills** (`skills/`): markdown files synced into the `learned_skills` table at startup and on file changes by `SkillSyncService` (`src/services/skills/skill-sync.ts`), which wraps each `SKILL.md` body in `SKILL_LEARNING_PROMPT` (with `<GATEWAY_HOST>` resolved to `config.GATEWAY_HOST`) and prunes rows whose folder was removed. To add a skill, add a `skills/<name>/SKILL.md` with front-matter + body.

## Database schema (`src/infrastructure/db-sqlite.ts`)

Tables: `heartbeat`, `sessions`, `memories` (long-term; `type` in summary/fact/lesson/reminder), `messages` (short-term, `role` in user/assistant/system), `images`, `learned_skills`. Foreign keys cascade on `session_id`. Access **only** through `src/repositories/*`. `DatabaseServiceFactory.create()` is safe to call many times (multiple instances share one DB file; init is reported once).

## Default heartbeats (`heartbeats.default.json`)

`heartbeats.default.json` at the project root defines the beats seeded into the `heartbeat` table on every startup by `seedDefaultBeats()` (`src/services/agents/sub-agents/heartbeat/default-beats.ts`, called from `app.ts`). Entries are `{ beat, type, cron_expression, channel?, target? }`. Config-owned beats are marked `managed=1` and fully synced (updated, or pruned when removed from the file); beats created via the `set_beat` tool or dashboard are never touched. The reserved `__koris_clear_images__` beat is handled natively by the heartbeat sub-agent (no LLM call) — it empties the `images` table. `images` holds base64 attachments by uuid id; `messages.image_ids` stores the ids.

## Web frontend

- The browser UI is a React 19 SPA (Vite, React Router, Tailwind v4) in `web/`; the server side is the Express dashboard in `src/dashboard/`. `src/dashboard/index.ts` serves the built bundle from `dist-web/` and ends with an SPA fallback that returns `index.html` for any unmatched GET so React Router owns routing.
- Trace path: `web/index.html` (`#root`) → `web/src/main.tsx` (BrowserRouter) → `web/src/App.tsx` (`/` redirects to `/admin`) → `web/src/pages/admin/AdminLayout.tsx` (sidebar + nested routes) → per-page components in `web/src/pages/admin/`. Shared UI lives in `web/src/components/AdminUI.tsx`.
- `web/src/lib/api.ts` — `streamChat()` consumes the `/api/chat` SSE stream (`progress` status + `content_block_delta` text events); `apiRequest()` calls `/api/admin/*`; `checkHealth()` polls `/health`. `web/src/lib/markdown.ts` + `types.ts` handle rendering and response types.
- `web/src/lib/chat-context.tsx` — `ChatProvider`/`useChat` hold conversation state, hydrate prior history from `/api/admin/chat/history`, stream replies, and poll server health every 5s. Chats are sessions; `POST /api/admin/sessions` creates a new one without ending the previous, `/api/chat` accepts an optional `sessionId` to route messages to a specific session (`gateway.handle(message, 'web', { sessionId })`, `src/dashboard/index.ts:104`).
- Admin API: `src/dashboard/admin.ts` (`AdminRouterFactory`, mounted at `/api/admin`) — overview, sessions, memories, chat history, heartbeats (create/update/delete with cron validation), skills (list merged disk+learned, `PATCH /skills/:name` enable/disable, `POST /skills/sync`), settings. Settings are deep-masked for secrets (`BOT_TOKEN`, `API_TOKEN`, `SEARCH_API_KEY`).
- Build `pnpm build:client` → `dist-web/` (root/outDir in `vite.config.mts`); dev `pnpm dev:client` on port 5173 proxies `/api` and `/health` to `localhost:3000`; type-check via `pnpm lint:client` (`web/tsconfig.json`).

## Conventions to follow

- **Interfaces prefixed `I`** (`IMessageGateway`, `ILogger`, `IChatService`); implementations are classes; creation is via `XxxFactory.create()` and singletons via `XxxSingleton.getInstance()`.
- **No code comments** in source files unless asked. Code should be self-explanatory.
- **Relative imports only** (the `@` alias exists only in Vitest config, not tsconfig — tests can use `@/`, source should not).
- Config values come from the `config` object, never hard-coded secrets or paths.
- Logging via `LoggerFactory.create()` / `ILogger` (Winston). Note `app.ts` sets `LOG_SILENCE_CONSOLE` before importing anything when `--tui` is used — keep that ordering when touching logging.
- Strict TS: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` are on. `pnpm lint` must pass.
- Use `pnpm build` before `pnpm app`; `dist/` is gitignored build output.

## Testing

- Unit tests: `tests/unit/**`, mirroring `src/` structure. Integration: `tests/integration/`.
- Run `pnpm test` and `pnpm lint` before considering a change done. Vitest suppresses `console.log` output (see `vitest.config.ts`).
- `tests/helpers/test-config.ts` provides a test settings fixture; `tests/setup/vitest.setup.ts` runs globally.
- Mutation testing config in `stryker.config.json`.
