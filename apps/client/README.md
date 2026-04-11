# opencrawdio (client)

This package contains the main opencrawdio client (TUI + Telegram integration).

## Run

- `pnpm dev` (telegram mode)
- `pnpm dev:tui` (tui mode)

## Configure AI (Ollama)

Create `apps/client/.env` (see `.env.example`):

- `AI_PROVIDER=ollama`
- `AI_BASE_URL=http://localhost:11434`
- `AI_MODEL=gemma4:e2b`

Notes:
- In unit tests, the client defaults to `AI_PROVIDER=mock` so tests don’t require a running Ollama server.

