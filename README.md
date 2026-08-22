<p align="center">
  <img src="web/public/logo.png" width="120" alt="Koris Assistant logo" />
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

<p align="left">
  🌐 <a href="https://guilhermesalviano.github.io/koris"><b>Landing page</b></a>
</p>

---

## Key Features

- 🧩 **Modular architecture** — extend capabilities via a plugin system (channels) and a markdown-based skill system.
- 💬 **Pluggable channels** — Telegram, WhatsApp, a Terminal UI, and a web dashboard, all driven by the same agent core.
- 🧠 **Persistent memory** — long-term memories, session tracking, and short-term conversation history in SQLite.
- ⏰ **Heartbeat agents** — scheduled, cron-driven sub-agents ("beats") that run autonomously in the background.
- 🛠️ **Tool execution** — shell commands, HTTP requests (domain-gated), web search, and beat management, exposed to the LLM.
- 🔌 **Multi-provider AI** — swap between Ollama, NVIDIA, or a mock provider per role (main agent vs. background workers).
- 📺 **Web dashboard** — a React admin UI for chatting with the agent and managing sessions, memories, heartbeats, and skills.
- 🦺 **Type-safe** — built end-to-end in strict TypeScript.

## Prerequisites

- Node.js
- pnpm

## Setup & Configuration

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure settings:**
   Copy the example settings file to `settings.json` and adjust as necessary:
   ```bash
   cp settings.example.json settings.json
   ```

3. **Build the project:**
   ```bash
   pnpm build
   ```

## Running the Agent

You can run the agent in different modes depending on your interface preference.

### Web Interface

Start the agent as a web service:

```bash
pnpm app
```

Once running, the dashboard will be available at: `http://localhost:3000`

### Terminal User Interface (TUI)

```bash
pnpm app --tui
```

### Telegram

```bash
pnpm app telegram
```

## Available Scripts

All commands are run via `pnpm` (or `pnpm run <script>`).

### Runtime

| Script | Description |
| --- | --- |
| `app` | Runs the agent (Node). Accepts `--tui` for the terminal UI or `telegram` to run the Telegram mode. Requires a prior build. |
| `onboard` | Runs the first-time onboarding/setup flow (Node). |
| `validate` | Validates `settings.json` against the expected schema and exits with an error if misconfigured. |

### Build & Tooling

| Script | Description |
| --- | --- |
| `build` | Cleans the previous output and compiles TypeScript into `dist/`, plus the web frontend into `dist-web/`. Run this before `app`/`onboard`. |
| `build:client` | Builds only the web frontend (`vite build` → `dist-web/`). |
| `dev:client` | Runs the Vite dev server for the web frontend (proxies `/api` and `/health` to `localhost:3000`). |
| `clean` | Removes the `dist/` and `dist-web/` build output. |
| `lint` | Type-checks the server with `tsc --noEmit`. |
| `lint:client` | Type-checks the web frontend. |
| `lint:landing` | Type-checks the landing page. |
| `clear:memory` | Wipes the local SQLite database files under `memory/` (fresh state). |

### Testing

| Script | Description |
| --- | --- |
| `test` | Runs the full test suite once (`vitest run`). |
| `test:watch` | Runs tests in watch mode, re-running on file changes. |
| `test:ui` | Opens the Vitest web UI for browsing and running tests interactively. |
| `test:coverage` | Runs the tests and reports code coverage. |
| `test:mutation` | Runs mutation testing with Stryker to assess test-suite quality. |

### Landing Page

| Script | Description |
| --- | --- |
| `landing:dev` | Runs the Next.js dev server for the marketing landing page. |
| `landing:build` | Statically exports the landing page to `landing/out/`. |
| `landing:preview` | Serves the built landing page locally. |

## Learn More

For a deeper dive into the architecture (message flow, AI providers, plugins/skills, database schema), see [`AGENTS.md`](./AGENTS.md).

## Contributing

Contributions are welcome! See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the dev workflow and [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) for community guidelines. Found a security issue? See [`SECURITY.md`](./SECURITY.md).

## License

[ISC](./LICENSE)
