<p align="center">
  <img src="apps/web/public/logo.png" width="120" alt="Koris Assistant logo" />
</p>

<h1 align="center">Koris Assistant</h1>

<p align="center">
  An autonomous AI agent framework with pluggable channels, skills, persistent memory, and a web dashboard.
</p>

<p align="center">
  <a href="https://github.com/guilhermesalviano/koris/actions/workflows/tests.yml"><img src="https://img.shields.io/github/actions/workflow/status/guilhermesalviano/koris/tests.yml?branch=main&label=tests" alt="Tests"></a>
  <a href="https://github.com/guilhermesalviano/koris/actions/workflows/lint.yml"><img src="https://img.shields.io/github/actions/workflow/status/guilhermesalviano/koris/lint.yml?branch=main&label=lint" alt="Lint"></a>
  <a href="https://github.com/guilhermesalviano/koris/actions/workflows/codeql.yml"><img src="https://img.shields.io/github/actions/workflow/status/guilhermesalviano/koris/codeql.yml?label=codeql" alt="CodeQL"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white" alt="Node >= 24">
  <img src="https://img.shields.io/badge/package%20manager-pnpm-F69220?logo=pnpm&logoColor=white" alt="pnpm">
  <img src="https://img.shields.io/badge/license-ISC-blue" alt="License: ISC">
</p>

---

## Key Features

- **Modular architecture** — extend capabilities via a plugin system (channels) and a markdown-based skill system.
- **Pluggable channels** — Telegram, WhatsApp, a Terminal UI, and a web dashboard, all driven by the same agent core.
- **Persistent memory** — long-term memories, session tracking, and short-term conversation history in SQLite.
- **Heartbeat agents** — scheduled, cron-driven sub-agents ("beats") that run autonomously in the background.
- **Tool execution** — shell commands, HTTP requests (domain-gated), web search, and beat management, exposed to the LLM.
- **Multi-provider AI** — swap between Ollama, NVIDIA, or a mock provider per role (main agent vs. background workers).
- **Web dashboard** — a React admin UI for chatting with the agent and managing sessions, memories, heartbeats, and skills.
- **Type-safe** — built end-to-end in strict TypeScript.

## Prerequisites

- Node.js
- pnpm
- some AI provider(ollama/nvidia)

## Setup & Configuration

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure settings:**
   Copy the example settings file to `koris.json` and adjust as necessary:
   ```bash
   cp core/koris.example.json core/koris.json
   ```

3. **Build the project:**
   ```bash
   pnpm build
   ```

## Running the Agent

You can run the agent in different modes depending on your interface preference.

### Web Interface

Start the agent as a web service; you can still chat in installed channels.

```bash
pnpm app
```

Once running, the dashboard will be available at: `http://localhost:3000`

### Terminal User Interface (TUI)

```bash
pnpm app --tui
```

## Web Search (SearXNG)

The `search_engine` tool uses a self-hosted [SearXNG](https://docs.searxng.org/) instance — free, no per-query cost, no API key. It's optional: skip this if you don't need web search.

1. **Configure and start SearXNG** (requires Docker):
   ```bash
   cd external/search/searxng
   mkdir -p config
   cp settings.example.yml config/settings.yml
   openssl rand -hex 32   # paste the output as server.secret_key in config/settings.yml
   docker compose up -d
   ```
   Make sure `config/settings.yml` exists as a **file** before running `docker compose up` — if it doesn't, Docker will happily start anyway but silently create an empty directory in its place, which crashes the container. If you ever see `is a directory` errors in `docker logs koris-searxng`, run `docker compose down -v`, `rm -rf config`, and redo the steps above.
2. **Point the agent at it** — set `ai.searxng_url` in `koris.json`:
   ```json
   "ai": {
     "searxng_url": "http://localhost:8080"
   }
   ```
3. Restart the agent (or use the web Settings page, which reloads config live).

`json` output format is enabled by `settings.example.yml` already (it's off by default on a fresh SearXNG install and the tool will get HTTP 403s otherwise) — no extra steps needed if you used the file as-is.

## Available Scripts

All commands are run via `pnpm` (or `pnpm run <script>`).

### Runtime

| Script | Description |
| --- | --- |
| `app` | Runs the agent (Node). Accepts `--tui` for the terminal UI or `telegram` to run the Telegram mode. Requires a prior build. |
| `onboard` | Runs the first-time onboarding/setup flow (Node). |
| `validate` | Validates `koris.json` against the expected schema and exits with an error if misconfigured. |

### Build & Tooling

| Script | Description |
| --- | --- |
| `build` | Cleans the previous output and compiles TypeScript into `dist/`, plus the web frontend into `dist-web/`. Run this before `app`/`onboard`. |
| `build:client` | Builds only the web frontend (`vite build` → `dist-web/`). |
| `dev:client` | Runs the Vite dev server for the web frontend (proxies `/api` and `/health` to `localhost:3000`). |
| `clean` | Removes the `dist/` and `dist-web/` build output. |
| `lint` | Type-checks the server with `tsc --noEmit`. |
| `lint:client` | Type-checks the web frontend. |
| `lint:website` | Type-checks the marketing website. |
| `clear:memory` | Wipes the local SQLite database files under `core/memory/` (fresh state). |

### Testing

| Script | Description |
| --- | --- |
| `test` | Runs the full test suite once (`vitest run`). |
| `test:watch` | Runs tests in watch mode, re-running on file changes. |
| `test:ui` | Opens the Vitest web UI for browsing and running tests interactively. |
| `test:coverage` | Runs the tests and reports code coverage. |
| `test:mutation` | Runs mutation testing with Stryker to assess test-suite quality. |

### Website

| Script | Description |
| --- | --- |
| `website:dev` | Runs the Next.js dev server for the marketing website. |
| `website:build` | Statically exports the website to `website/out/`. |
| `website:preview` | Serves the built website locally. |

## Learn More

For a deeper dive into the architecture (message flow, AI providers, plugins/skills, database schema), see [`AGENTS.md`](./AGENTS.md).

## Contributing

Contributions are welcome! See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the dev workflow and [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) for community guidelines. Found a security issue? See [`SECURITY.md`](./SECURITY.md).

## License

[ISC](./LICENSE)
