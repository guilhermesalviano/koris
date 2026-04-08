# opencrawdio Demo

## Quick Start

### 1. TUI Mode (Easiest to test)

No Telegram bot needed! Just run:

```bash
pnpm dev:tui
```

Then try these commands:

```
You: /help
Agent: [Shows available commands and instructions]

You: read package.json
Agent: [Shows mock file contents]

You: list src
Agent: [Shows mock directory structure]

You: search for config
Agent: [Shows mock search results]

You: execute npm test
Agent: [Shows what command would be executed]

You: /exit
```

### 2. Telegram Mode

1. Set up your bot token in `.env`:
   ```
   TELEGRAM_BOT_TOKEN=your_token_here
   ```

2. Run the bot:
   ```bash
   pnpm dev
   ```

3. Open Telegram and send messages to your bot:
   - `/start` - Get welcome message
   - `/help` - See commands
   - "read src/index.ts" - Test file reading
   - "list src/" - Test directory listing

## Mock Instruction Examples

The agent detects these patterns:

| Instruction | Example Message | Mock Action |
|-------------|----------------|-------------|
| Read file | "read package.json" | Shows mock file content |
| Write file | "write test.txt" | Shows what would be written |
| List directory | "list src" | Shows mock directory tree |
| Execute command | "run npm test" | Shows command that would execute |
| Search | "search for config" | Shows mock search results |

## Next Steps

- [ ] Replace mocks with real file system operations
- [ ] Integrate Ollama AI for intelligent responses
- [ ] Implement command execution with sandboxing
- [ ] Add real code search (grep/ripgrep)
- [ ] Add conversation history management
- [ ] Implement approval workflow for destructive operations

## Architecture Highlights

- **Dual Interface**: Works via Telegram bot OR TUI
- **Shared Processor**: Both interfaces use `agent/processor.ts`
- **Mock First**: Demonstrates capabilities before implementing complex AI
- **TypeScript**: Full type safety with strict mode
- **ESM**: Modern ES modules with `.js` extensions
