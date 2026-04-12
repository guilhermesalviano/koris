# opencrawdio Demo

Run from the repo root.

## Quick Start

### 1) TUI Mode (easiest to test)

No Telegram bot needed, no web server needed:

```bash
pnpm dev:tui
```

Then try:

```
/help
read package.json
list src
search for config
/exit
```

### 2) Web Mode (browser interface)

Browser-based chat with real-time SSE streaming:

```bash
# Start server
pnpm dev

# Visit http://localhost:3000 in your browser
```

Features:
- Real-time markdown rendering
- Syntax highlighting for code blocks
- Tool execution responses (AI calls tools automatically)
- Server health status indicator
- Character counter (max 4000)

### 3) Telegram Mode

Remote access via Telegram:

1. Create `.env` from the example:

   ```bash
   cp apps/client/.env.example apps/client/.env
   # edit apps/client/.env and set TELEGRAM_BOT_TOKEN
   ```

2. Run:

   ```bash
   pnpm dev
   ```

3. Open Telegram and message your bot.

## How It Works

### AI Provider Integration

The system uses **Ollama** for AI responses with automatic **tool execution**:

1. User sends message → "read my config file"
2. Ollama processes and decides to call `read_file` tool
3. System executes the tool and captures output
4. Results sent back to Ollama for continuation
5. Final response returned to user

All interfaces (TUI, Web, Telegram) use the same backend, so results are identical.

### File Operations

The AI can automatically execute:
- `read_file` - Read file contents
- `write_file` - Create/modify files  
- `list_dir` - List directory contents
- `search` - Search files for patterns
- `execute_command` - Run shell commands

### Logging

All requests/responses logged to:
- `apps/client/logs/combined.log` - All logs
- `apps/client/logs/error.log` - Errors only

View logs:
```bash
tail -f apps/client/logs/combined.log
```

## Configuration

See `apps/client/.env.example` for all options:

```env
# Must have Ollama running for these modes
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434
AI_MODEL=gemma4:e2b

# For testing without Ollama
# AI_PROVIDER=mock
```

## Architecture Notes

- **Telegram connectivity**: Provided by `apps/telegram-bot` module (polling mode)
- **TUI runner**: Provided by `apps/assistant-tui` module
- **Backend**: Unified message processor routes to provider and tools
- **Web server**: Express with static file serving + SSE streaming

