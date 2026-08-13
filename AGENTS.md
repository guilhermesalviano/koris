# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

`koris-agent` is an autonomous AI agent framework written in TypeScript (CommonJS, strict mode). It receives messages through pluggable channels (Telegram, WhatsApp, TUI, web dashboard), runs them through an LLM, and can execute tools (`curl`, some shell commands, search, beats, skills instructions). It has persistent SQLite memory, session tracking, heartbeat (scheduled) agents, and a summarizer sub-agent.

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

- `src/app.ts` — process entry point: wires DB, SessionManager, Agent, channels, heartbeat, web server, TUI. Mode detection via argv flags.
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
- `skills/` — markdown skill definitions, one folder per skill with a `SKILL.md` (front-matter `name`/`description` + body). Loaded at runtime by the `get_skill` tool.
- `memory/` — runtime SQLite database files (gitignored state).
- `temp/` — runtime scratch dir for generated files (heartbeat reports, etc.).
- `scripts/` — helper scripts (`init.ts`).
- `tests/` — Vitest suites: `unit/`, `integration/`, plus `helpers/test-config.ts` and `setup/vitest.setup.ts`.
- `web/` — the web frontend (React 19 SPA; see "Web frontend" below).
- `dist/` — build output (never edit).
- `dist-web/` — built web frontend (never edit).

## Core message flow (follow this to trace behavior)

1. A channel plugin (`plugins/telegram`, `plugins/whatsapp`, or `src/tui`) calls `Agent.handle(message, originId)`.
2. `src/services/agents/main-agent/agent.ts` resolves the session, checks for commands (`/help` etc. via `src/services/commands/`), else delegates to the **Manager**.
3. `src/services/agents/sub-agents/manager.ts` builds the first prompt (`FIRST_PROMPT_HELPER`), calls `ChatService.complete()` (`src/services/chat/chat-service.ts`), which builds the full prompt via `PromptRepository.build()` and calls the AI provider.
4. If the LLM returns tool calls, Manager splits them: `get_skill` calls go to the **LearnerWorker** (`src/services/workers/learner-worker.ts`), everything else goes to the **ExecutorWorker** (`src/services/workers/executor-worker.ts`) which loops tool-call → tool result → next LLM call until a final message.
5. `Agent` fires background workers: `ConversationWorker` (`src/services/workers/conversation-worker.ts`) persists the exchange, and the **Summarizer** sub-agent (`src/services/agents/sub-agents/summarizer/`) may condense long context into memories.
6. Sub-agent execution loop keeps firing until terminal message or max iterations. Abort via `AbortController` passed in `ProcessOptions`.

## AI providers

- `src/services/providers/index.ts` — factory registry + singleton `getAIProvider(logger)`.
- Implementations: `ollama/index.ts`, `nvidia/index.ts`, `mock/index.ts`. Implement `AIProvider` (`src/types/chat.ts`).
- `src/services/ai-completion-service.ts` wraps a provider and maps errors to typed `AIErrorCode`s (`aborted`, `timeout`, `authentication`, `rate_limited`, `unavailable`, `malformed_response`, `unknown`).
- `src/services/provider-health-service.ts` — health checks / timeouts for providers.
- Add a new provider: create `src/services/providers/<name>/index.ts`, register it in the `PROVIDER_FACTORIES` map.

## Tools

- Tool registry: `src/services/tools/index.ts` — `AgnosticExecutionTool` dispatches tool name → handler via `COMMAND_MAP`.
- Tools: `execute-command`, `curl-request` (respects `allowed_domains` in settings), `search` (SerpAPI), `get-skill` (loads `skills/<name>/SKILL.md`, path-traversal guarded), `beats/*` (create/list/update/delete recurring beats). Shared helper: `src/services/tools/runtime.ts`.
- `src/services/tools-queue/` — throttling/serialization of tool calls.

## Security

- `src/services/security/gate.ts` — domain allowlist gate for tools. `gateErrorForUrl(input)` returns an error string when a URL's hostname is not in `settings.json` `allowed_domains`, or `null` when permitted; `extractHostname(input)` parses and validates a hostname; `getAllowedDomains()` reads the configured allowlist. Used by `curl-request` to block requests outside the allowlist.
- `src/services/tools/runtime.ts` — child-process execution helpers with output-size limits and no-shell `spawn`/`execFile` (structural defense against shell injection).

## Workers & sub-agents

- `src/services/workers/` — `conversation-worker.ts`, `executor-worker.ts`, `learner-worker.ts`. All implement `IWorker` (`src/types/workers.ts`).
- `src/services/agents/sub-agents/` — `manager.ts` (orchestrator), `heartbeat/` (scheduled beats: `runner.ts` schedules, `sub-agent.ts` runs the beat LLM), `summarizer/`.

## Plugins & skills (extension mechanisms)

- **Plugins** (`plugins/`): a plugin is a folder exposing `create(): Plugin | null`. `createPlugins()` scans the dir, `buildRegistry()` calls each `setup(registry)`. Channel plugins extend `ADAPTERS` (from `src/channels`) with a `ChannelDefinition` (`name`, `enabled`, `start`, optional `sendMessage`). Add a new channel by adding a folder under `plugins/`.
- **Skills** (`skills/`): markdown files loaded at runtime by the `get_skill` tool. When the LLM requests `get_skill`, the LearnerWorker stores them in the `learned_skills` table (subject to `learned_skills_limit`). To add a skill, add a `skills/<name>/SKILL.md` with front-matter + body.

## Database schema (`src/infrastructure/db-sqlite.ts`)

Tables: `heartbeat`, `sessions`, `memories` (long-term; `type` in summary/fact/lesson/reminder), `messages` (short-term, `role` in user/assistant/system), `learned_skills`. Foreign keys cascade on `session_id`. Access **only** through `src/repositories/*`. `DatabaseServiceFactory.create()` is safe to call many times (multiple instances share one DB file; init is reported once).

## Web frontend

- The browser UI is a React 19 SPA (Vite, React Router, Tailwind v4) in `web/`; the server side is the Express dashboard in `src/dashboard/`. `src/dashboard/index.ts` serves the built bundle from `dist-web/` and ends with an SPA fallback that returns `index.html` for any unmatched GET so React Router owns routing.
- Trace path: `web/index.html` (`#root`) → `web/src/main.tsx` (BrowserRouter) → `web/src/App.tsx` (`/` redirects to `/admin`) → `web/src/pages/admin/AdminLayout.tsx` (sidebar + nested routes) → per-page components in `web/src/pages/admin/`. Shared UI lives in `web/src/components/AdminUI.tsx`.
- `web/src/lib/api.ts` — `streamChat()` consumes the `/api/chat` SSE stream (`progress` status + `content_block_delta` text events); `apiRequest()` calls `/api/admin/*`; `checkHealth()` polls `/health`. `web/src/lib/markdown.ts` + `types.ts` handle rendering and response types.
- `web/src/lib/chat-context.tsx` — `ChatProvider`/`useChat` hold conversation state, hydrate prior history from `/api/admin/chat/history`, stream replies, and poll server health every 5s. Chats are sessions; `POST /api/admin/sessions` creates a new one without ending the previous, `/api/chat` accepts an optional `sessionId` to route messages to a specific session (`agent.handle(message, 'web', { sessionId })`, `src/dashboard/index.ts:104`).
- Admin API: `src/dashboard/admin.ts` (`AdminRouterFactory`, mounted at `/api/admin`) — overview, sessions, memories, chat history, heartbeats (create/update/delete with cron validation), skills, settings. Settings are deep-masked for secrets (`BOT_TOKEN`, `API_TOKEN`, `SEARCH_API_KEY`).
- Build `pnpm build:client` → `dist-web/` (root/outDir in `vite.config.mts`); dev `pnpm dev:client` on port 5173 proxies `/api` and `/health` to `localhost:3000`; type-check via `pnpm lint:client` (`web/tsconfig.json`).

## Conventions to follow

- **Interfaces prefixed `I`** (`IAgent`, `ILogger`, `IChatService`); implementations are classes; creation is via `XxxFactory.create()` and singletons via `XxxSingleton.getInstance()`.
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
