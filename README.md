<p align="center">
  <img src="apps/web/public/logo.png" width="120" alt="Koris Assistant logo" />
</p>

<h1 align="center">Koris Assistant</h1>

<p align="center">
  An autonomous AI agent framework with pluggable channels, tools, skills, MCP servers, persistent memory, voice support, and desktop/web interfaces.
</p>

<p align="center">
  <a href="https://github.com/guilhermesalviano/koris/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/guilhermesalviano/koris/ci.yml?branch=main&label=ci" alt="CI"></a>
  <a href="https://github.com/guilhermesalviano/koris/actions/workflows/codeql.yml"><img src="https://img.shields.io/github/actions/workflow/status/guilhermesalviano/koris/codeql.yml?label=codeql" alt="CodeQL"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white" alt="Node >= 24">
  <img src="https://img.shields.io/badge/package%20manager-pnpm-F69220?logo=pnpm&logoColor=white" alt="pnpm">
  <img src="https://img.shields.io/badge/license-ISC-blue" alt="License: ISC">
</p>

---

## Key Features

- **Modular Architecture & Dynamic Plugins** — Extend capabilities across 4 plugin families: channels (`plugins/channels/`), tools (`plugins/tools/`), skills (`plugins/skills/`), and MCP servers (`plugins/mcps/`), dynamically downloaded on demand from [`koris-hub`](https://github.com/guilhermesalviano/koris-hub) and hot-loaded without restarting.
- **Pluggable Channels** — Telegram, WhatsApp, an interactive Terminal UI (TUI), and a web dashboard, all driven by the unified message gateway and session manager.
- **Model Context Protocol (MCP)** — Connect external MCP servers over Streamable HTTP; remote tools are dynamically discovered, namespaced as `<server>__<tool>`, and made available in the LLM tool execution pipeline.
- **Voice & Speech Support (STT & TTS)** — Local speech-to-text (Whisper via `sherpa-onnx`) and text-to-speech (Piper neural voices) running in a lightweight local sidecar. Supports voice note transcription in WhatsApp/Web and per-conversation voice reply mode (`/mode voice`).
- **Persistent SQLite Memory & Sessions** — Long-term memories (facts, lessons, summaries), semantic memory embeddings, session tracking, and conversation history in SQLite.
- **Multi-Provider AI & Role Mapping** — Ollama, OpenAI-compatible presets (`openai`, `deepseek`, `groq`, `openrouter`, `xai`, `mistral`, `together`, `gemini`, `nvidia`), and Mock. Assign different providers/models per role (Main Agent manager vs. background workers vs. embeddings).
- **Multiple Client Shells** — React 19 web dashboard, interactive TUI, native Tauri desktop app (lightweight OS webview, ~80–100 MB RAM), and native Electron desktop shell.
- **Heartbeat Agents** — Scheduled cron-driven background sub-agents ("beats") for autonomous routines, maintenance, and notifications.
- **Safe Tool Execution** — Sandboxed execution for HTTP curl (domain-gated), self-hosted web search (SearXNG), issue tracking, beat management, stickers, and custom plugins.
- **Type-Safe & Tested** — Built end-to-end in strict TypeScript (100% strict type check), comprehensive Vitest test suites, and Stryker mutation testing.

## Prerequisites

- **Node.js** >= 24.0.0
- **pnpm** >= 10.18.3
- **AI Provider**: Local Ollama or an API key for any supported provider (OpenAI, Gemini, Groq, OpenRouter, DeepSeek, etc.)
- *(Optional)* **Docker & Docker Compose**: For running self-hosted SearXNG (web search) or the local audio sidecar (Whisper/Piper).
- *(Optional)* **Rust & Cargo**: Only required if building or developing the Tauri desktop shell (`apps/tauri`).

## Setup & Configuration

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure settings:**
   Copy the example settings file to `koris.json` and adjust as necessary:
   ```bash
   cp koris.example.json koris.json
   ```
   *Or run the interactive onboarding wizard:*
   ```bash
   pnpm onboard
   ```

3. **Validate configuration:**
   ```bash
   pnpm validate
   ```

4. **Build the project:**
   ```bash
   pnpm build
   ```

## Running the Agent

### Web Dashboard
Start the agent as a web service with the dashboard and any installed channels:
```bash
pnpm app
```
Once running, the dashboard is available at: `http://localhost:3000`

### Terminal User Interface (TUI)
```bash
pnpm app --tui
```

### Desktop Applications
Koris provides two native desktop shells that wrap the local server and web dashboard:
- **Tauri Desktop Shell** (Recommended — lightweight native OS webview, ~80–100 MB RAM):
  ```bash
  pnpm tauri:dev
  ```
- **Electron Desktop Shell** (Runs the server in-process):
  ```bash
  pnpm desktop
  # Dev mode:
  pnpm desktop:dev
  ```

## Voice & Audio Sidecar (STT & TTS)

Koris supports fully local speech-to-text (Whisper) and neural text-to-speech (Piper) via a lightweight HTTP sidecar running on port `6006`.

1. **Setup models:**
   ```bash
   pnpm audio:setup         # Default: whisper-small (~480MB, recommended for Portuguese & multilingual)
   # Or select a specific model size:
   pnpm audio:setup:tiny    # Ultra-lightweight (~70MB)
   pnpm audio:setup:base    # Fast baseline (~140MB)
   pnpm audio:setup:tts     # Piper TTS voices
   ```

2. **Start the audio sidecar (Docker):**
   ```bash
   pnpm audio:start
   ```

3. **Enable audio in `koris.json`:**
   ```json
   "audio": {
     "stt": {
       "enabled": true,
       "endpoint": "http://127.0.0.1:6006/v1/audio/transcriptions",
       "language": "auto"
     },
     "tts": {
       "enabled": true,
       "endpoint": "http://127.0.0.1:6006/v1/audio/speech",
       "voice": "en_US-lessac-medium"
     }
   }
   ```

In chat or channels, use `/mode voice` to have the agent reply with audio voice notes instead of text. Voice notes sent in WhatsApp or via the web UI are automatically transcribed.

## Web Search (SearXNG)

The `search_engine` tool uses a self-hosted [SearXNG](https://docs.searxng.org/) instance — free, privacy-friendly, no per-query cost, no API key.

1. **Start SearXNG:**
   ```bash
   bash scripts/search/run_search_engine.sh
   ```
   *(To force a restart / container recreate: `bash scripts/search/run_search_engine.sh --restart`)*

2. **Configure in `koris.json`:**
   ```json
   "ai": {
     "searxng_url": "http://localhost:8080"
   }
   ```

## Plugins & Hub Ecosystem

Koris separates the runtime engine from plugin implementations. Channels, tools, skills, and MCP servers live in [`koris-hub`](https://github.com/guilhermesalviano/koris-hub) and are installed dynamically:

- **List available plugins:**
  ```bash
  pnpm hub:list
  ```
- **Pull/install a plugin:**
  ```bash
  pnpm hub:pull <slug>
  ```
- **From chat (slash commands):**
  - `/channels` — Manage installed and remote channel plugins (e.g. `/channels download telegram`)
  - `/tools` — Manage and download agent tools (e.g. `/tools download curl-request`)
  - `/skills` — Manage and download prompt skills (e.g. `/skills download coder`)
  - `/mcps` — Manage, toggle, and download MCP server plugins (e.g. `/mcps enable github`)

Pulled tools and MCP servers are hot-loaded into the running process without a restart. For detailed architectural information and configuration guides, see [`PLUGINS.md`](./PLUGINS.md).

## Slash Commands

Available in trusted sessions across all interfaces (Web, TUI, WhatsApp, Telegram):

| Command | Description |
| --- | --- |
| `/help [command]` | Display command help or details on a specific command |
| `/status` | View connection state, AI provider, model, and active session modes |
| `/usage [today\|days]` | Token usage and LLM execution audit report |
| `/whoami` | View your identity, channel, and trust level |
| `/mode [text\|voice]` | Switch conversation reply mode between text and voice notes |
| `/memory` | Inspect context summarised into the active session |
| `/compact` | Summarise the current session into memory and rotate to a fresh session |
| `/clear` | Reset and start a fresh empty session (without carrying summary forward) |
| `/channels` | List, download (`/channels download <name>`), or toggle channels |
| `/tools` | List, discover (`/tools remote`), or download (`/tools download <name>`) agent tools |
| `/skills` | List, discover, or download skills; execute one-turn skills via `/<skill-name>` |
| `/mcps` | List, discover (`/mcps remote`), download, enable, or disable MCP server plugins |
| `/allow <domain>` | Dynamically allow an outbound domain for HTTP tools |

## Available Scripts

All commands are run via `pnpm <script>`.

### Runtime & Desktop
| Script | Description |
| --- | --- |
| `pnpm app` | Runs the agent server (Web dashboard on port 3000 + installed channels). Pass `--tui` for Terminal UI. |
| `pnpm onboard` | Runs the interactive onboarding flow. |
| `pnpm validate` | Validates `koris.json` against the schema. |
| `pnpm tauri:dev` | Runs the Tauri desktop app in dev mode (spawns supervised Node backend). |
| `pnpm desktop` | Runs the Electron desktop shell (in-process server). |
| `pnpm desktop:dev` | Runs Electron desktop in dev mode. |
| `pnpm desktop:package` | Builds platform distribution packages for Electron. |

### Audio Sidecar
| Script | Description |
| --- | --- |
| `pnpm audio:start` | Builds and starts the local audio sidecar (Whisper + Piper) via Docker. |
| `pnpm audio:setup` | Downloads default models (`whisper-small` + Piper voice). |
| `pnpm audio:setup:small` | Downloads Whisper small model (~480MB). |
| `pnpm audio:setup:base` | Downloads Whisper base model (~140MB). |
| `pnpm audio:setup:tiny` | Downloads Whisper tiny model (~70MB). |
| `pnpm audio:setup:tts` | Downloads Piper neural TTS voices. |

### Plugins & Hub
| Script | Description |
| --- | --- |
| `pnpm hub:list` | Lists plugins available in `koris-hub` that are not yet installed locally. |
| `pnpm hub:pull` | Downloads a plugin from `koris-hub` (e.g. `pnpm hub:pull <slug>`). |
| `pnpm scaffold:tool` | Scaffolds a new tool plugin folder template under `plugins/tools/`. |
| `pnpm bundle:channels` | Bundles channels into self-contained standalone CJS artifacts for publishing. |

### Build, Lint & Test
| Script | Description |
| --- | --- |
| `pnpm build` | Compiles TypeScript into `dist/` and builds the web client into `dist-web/`. |
| `pnpm build:client` | Builds only the web frontend (`vite build` → `dist-web/`). |
| `pnpm build:desktop` | Compiles Electron desktop files (`apps/desktop/out/`). |
| `pnpm build:tauri` | Compiles Tauri Node sidecar (`apps/tauri/sidecar/out/`). |
| `pnpm dev:client` | Runs Vite dev server (port 5173, proxies `/api` and `/health` to 3000). |
| `pnpm lint` | Type-checks server code (`tsc --noEmit`). |
| `pnpm lint:client` | Type-checks web frontend code. |
| `pnpm lint:desktop` | Type-checks Electron desktop code. |
| `pnpm lint:tauri` | Type-checks Tauri sidecar code. |
| `pnpm clean` | Removes `dist/` and `dist-web/` build output. |
| `pnpm clear:memory` | Deletes SQLite database files under `memory/database.*`. |
| `pnpm test` | Runs the full Vitest test suite (`vitest run`). |
| `pnpm test:watch` | Runs Vitest in watch mode. |
| `pnpm test:ui` | Opens the Vitest interactive web UI. |
| `pnpm test:coverage` | Runs Vitest with v8 code coverage reporting. |
| `pnpm test:mutation` | Runs Stryker mutation testing. |

## Learn More

- Architecture and internals guide: [`AGENTS.md`](./AGENTS.md)
- Dynamic plugins, marketplace, and bash guide: [`PLUGINS.md`](./PLUGINS.md)
- Plugins repository and docs marketplace: [`koris-hub`](https://github.com/guilhermesalviano/koris-hub)

## Contributing

Contributions are welcome! See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the dev workflow and [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) for community guidelines. Found a security issue? See [`SECURITY.md`](./SECURITY.md).

## License

[ISC](./LICENSE)
