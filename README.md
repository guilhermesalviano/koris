# opencrawdio

[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.18.3-orange.svg)](https://pnpm.io/)
[![Security Tests](https://github.com/guilhermesalviano/opencrawdio/actions/workflows/tests.yml/badge.svg)](https://github.com/guilhermesalviano/opencrawdio/actions/workflows/tests.yml)
[![Lint](https://github.com/guilhermesalviano/opencrawdio/actions/workflows/lint.yml/badge.svg)](https://github.com/guilhermesalviano/opencrawdio/actions/workflows/lint.yml)
[![CodeQL](https://github.com/guilhermesalviano/opencrawdio/actions/workflows/codeql.yml/badge.svg)](https://github.com/guilhermesalviano/opencrawdio/actions/workflows/codeql.yml)

An AI-powered coding agent (mock tool implementation for now) with two user interfaces:

- Telegram bot
- TUI (terminal UI)

This repo is **modular**: the main runnable app lives in `apps/client/`, and reusable mini-modules live under `apps/*`.

> Note: It will be a modular monorepo project temporarily.

## Repository layout

- `apps/client/` — main app (agent + TUI + Telegram integration)
- `apps/assistant-tui/` — reusable TUI runner package (`assistant-tui`)
- `apps/telegram-bot/` — reusable Telegram connection package (`assistant-telegram-bot`)
- `apps/sh-compression/` — hookable CLI proxy + shared sub-instruction helpers (`sh-compression`)

## Prerequisites

- Node.js >= 24
- pnpm 10.18.3
- A Telegram bot token (from @BotFather) for Telegram mode

## Quick start (from repo root)

### Install

```bash
pnpm install
```

### Configure Telegram token (optional)

```bash
cp apps/client/.env.example apps/client/.env
# edit apps/client/.env and set TELEGRAM_BOT_TOKEN
```

### Run

```bash
# Telegram mode
pnpm dev

# TUI mode (no Telegram needed)
pnpm dev:tui
```

## Common commands

```bash
# Build (all packages)
pnpm build

# Production run (client)
pnpm start
pnpm start:tui

# Tests (all packages)
pnpm test

# Coverage (client)
pnpm --filter opencrawdio test:coverage

# Security tests only (client)
pnpm --filter opencrawdio test tests/security
```

### “Install” sh-compression it globally from your local folder

This creates a global symlink to the bin:
```
pnpm --filter sh-compression build
pnpm -C apps/sh-compression link --global
sh-compression -- node -v
```

To remove later:
``` 
pnpm unlink --global sh-compression
``` 
## Docs

- Architecture / agent internals: [AGENTS.md](AGENTS.md)
- Demo walkthrough: [apps/client/DEMO.md](apps/client/DEMO.md)
- Testing guide: [apps/client/TESTS.md](apps/client/TESTS.md)
- CI workflows: [.github/workflows/README.md](.github/workflows/README.md)

## Notes

- Ollama integration is planned; current behavior focuses on deterministic parsing + mocked tool responses.
- Telegram connectivity is intentionally isolated inside `apps/telegram-bot` and injected into the client.
