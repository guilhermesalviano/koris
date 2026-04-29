# koris-agent (client)

Multi-interface AI agent system with:
- **TUI**: Terminal user interface (readline-based)
- **Web**: Browser chat interface (Express + SSE streaming)
- **Telegram**: Bot interface for messaging

Powered by Ollama with automatic tool execution (read, write, search, execute commands).

## Quick Start

### TUI Mode (Fastest to Test)
```bash
pnpm dev:tui
```
Commands: `/help`, `read src/package.json`, `list src/`, `search config`, `/exit`

### Web Mode
```bash
pnpm dev  # Runs on http://localhost:3000
```
Visit browser and start chatting. Real-time SSE streaming with markdown rendering.

### Telegram Mode
```bash
# Create .env and set TELEGRAM_BOT_TOKEN
cp .env.example .env
pnpm dev
```

## Configuration

Create `apps/client/.env` (see `.env.example`):

```env
# AI Provider (ollama or mock for testing)
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434
AI_MODEL=gemma4:e2b

# Timeouts for remote models (seconds)
OLLAMA_IDLE_TIMEOUT=90
OLLAMA_HARD_TIMEOUT=900

# Telegram (if using Telegram mode)
TELEGRAM_BOT_TOKEN=your-token-here

# Logging
LOG_LEVEL=info
PORT=3000
```

**Notes**:
- Unit tests default to `AI_PROVIDER=mock` (no Ollama server needed)
- For TUI/Web/Telegram modes, ensure Ollama is running
- Default model: `gemma4:e2b` (change in `.env`)

## Features

- **Tool Execution**: Ollama automatically calls `read_file`, `write_file`, `list_dir`, `search`, `execute_command`
- **Streaming Responses**: Real-time output for all interfaces
- **File Operations**: Safe path validation prevents directory traversal
- **Logging**: Winston-based logs to `logs/combined.log` and `logs/error.log`
- **Security**: Input sanitization, path validation, rate limiting ready

## Development

```bash
# Watch mode with hot reload
pnpm dev:watch

# TypeScript check
pnpm check

# Lint
pnpm lint

# Tests (42 tests total)
pnpm test
```

## Project Structure

```
src/
├── ai/              # Provider layer (ollama, mock, tool execution)
├── agent/           # Message processor, commands
├── channels/        # Interface implementations (tui, web, telegram)
└── infrastructure/  # Logger, config

public/             # Web assets (HTML, JS, CSS)
tests/              # Unit and security tests
logs/               # Runtime logs (created on first run)
```

## Troubleshooting
- If your responses seem cut off in the middle, try increasing the context length in Ollama