# Koris Agent

Koris Agent is an autonomous AI agent framework designed with a modular architecture, featuring pluggable skills, persistent memory management, and an interactive Terminal User Interface (TUI).

## Key Features

- **Modular Architecture:** Easily extend capabilities using a plugin and skill-based system.
- **TUI-driven Interaction:** Manage your agents directly from the terminal.
- **Persistence:** Robust memory management and session tracking.
- **Extensible:** Built with TypeScript for type safety and maintainability.

## Prerequisites

- Node.js (>= 24.0.0)
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
| `build` | Cleans the previous output and compiles TypeScript into `dist/`. Run this before `app`/`onboard`. |
| `clean` | Removes the `dist/` build output. |
| `lint` | Type-checks the whole project with `tsc --noEmit` (no output emitted). |
| `clear:memory` | Wipes the local SQLite database files under `memory/` (fresh state). |

### Testing

| Script | Description |
| --- | --- |
| `test` | Runs the full test suite once (`vitest run`). |
| `test:watch` | Runs tests in watch mode, re-running on file changes. |
| `test:ui` | Opens the Vitest web UI for browsing and running tests interactively. |
| `test:coverage` | Runs the tests and reports code coverage. |
| `test:mutation` | Runs mutation testing with Stryker to assess test-suite quality. |

## Development

- **Run tests:**
  ```bash
  pnpm run test
  ```
- **Type-check:**
  ```bash
  pnpm run lint
  ```
