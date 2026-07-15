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

### Utility Commands

```bash
pnpm clear:memory
```

## Development

- **Run tests:**
  ```bash
  pnpm run test
  ```
- **Run linter:**
  ```bash
  pnpm run lint
  ```
