# opencrawdio 🤖

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.x-orange.svg)](https://pnpm.io/)
[![Tests](https://github.com/guilhermesalviano/opencrawdio/workflows/Tests/badge.svg)](https://github.com/guilhermesalviano/opencrawdio/actions)
[![Lint](https://github.com/guilhermesalviano/opencrawdio/workflows/Lint/badge.svg)](https://github.com/guilhermesalviano/opencrawdio/actions)

An AI-powered coding agent similar to Cline/Claude Code that uses Ollama for local AI inference and Telegram as the user interface.

## Features

- 🤖 AI coding agent powered by Ollama (local LLM)
- 💬 Dual interface: Telegram bot + CLI
- 📁 Mock file operations (read, write, list) - *Real implementation coming*
- ⚙️ Mock command execution - *Real implementation coming*
- 🔍 Mock code search - *Real implementation coming*
- 🔒 Local-first (your code never leaves your machine)

## Prerequisites

- Node.js 18+ (with pnpm)
- [Ollama](https://ollama.ai/) installed and running *(coming soon)*
- A Telegram bot token (from [@BotFather](https://t.me/botfather))

## Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Create a Telegram bot:**
   - Open Telegram and chat with [@BotFather](https://t.me/botfather)
   - Send `/newbot` and follow the instructions
   - Copy the bot token you receive

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your TELEGRAM_BOT_TOKEN
   ```

4. **Run the bot:**
   ```bash
   # Telegram mode
   pnpm dev
   
   # OR CLI mode (no Telegram needed)
   pnpm dev:cli
   ```

## Development

```bash
# Development with hot reload (Telegram mode)
pnpm dev

# Development with CLI mode
pnpm dev:cli

# Build TypeScript
pnpm build

# Run production build (Telegram mode)
pnpm start

# Run production build (CLI mode)
pnpm start:cli

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui
```

## Testing

The project includes comprehensive unit tests covering:
- Command handling (CLI & Telegram)
- Instruction detection
- File operations
- Telegram bot integration
- Markdown escaping

See [TESTS.md](TESTS.md) for detailed testing guide.

### CI/CD

GitHub Actions automatically run tests on every commit:
- ✅ Unit tests on Node.js 20.x
- ✅ TypeScript type checking
- ✅ Build verification

See [.github/workflows/README.md](.github/workflows/README.md) for workflow details.

## Configuration

Edit `.env` to configure:

- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token (required for Telegram mode)
- `OLLAMA_BASE_URL` - Ollama API endpoint (default: http://localhost:11434)
- `OLLAMA_MODEL` - Model to use (default: llama3.1)

## Usage

### Telegram Bot

Send messages to your Telegram bot:

- `/start` - Get started
- `/help` - Show available commands
- `/status` - Check bot status
- `/clear` - Clear conversation history

Or send natural language instructions:
- "read src/index.ts" - Read a file
- "list src/" - List directory
- "search for config" - Search codebase
- "execute npm test" - Run a command

### CLI Mode

Run in CLI mode for local testing without Telegram:

```bash
pnpm dev:cli
```

Then type your messages at the prompt:
- `/help` - Show commands
- "read package.json" - Test file reading
- "list src" - Test directory listing
- "/exit" or "/quit" - Exit CLI

## Mock Implementation

The current version includes **mock implementations** that demonstrate the agent's planned capabilities:

- **File operations**: Read, write, list directories
- **Command execution**: Run shell commands
- **Code search**: Search through codebase
- **Instruction detection**: Parse natural language requests

These mocks will be replaced with:
1. Real file system operations
2. Ollama AI integration for intelligent responses
3. Actual command execution with sandboxing
4. Real search using grep/ripgrep

## Architecture

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for detailed architecture and development guidelines.

## Project Structure

```
src/
├── config/index.ts           # Environment configuration
├── index.ts            # Entry point (Telegram or CLI mode)
├── telegram/           # Telegram bot implementation
│   ├── bot.ts          # Bot initialization
│   └── handlers.ts     # Message handlers
├── infrastructure
│   └── logger.ts       # Logger Factory with winston
├── cli/                # CLI interface
│   └── interface.ts    # CLI prompt and input handling
└── agent/              # Agent logic
    └── processor.ts    # Message processing and mock tools
```

## To-do

- [ ] wrap de IA, testes;
- [ ] multi sessões - rodar me background com o telegram e ter a possibilidade de startar outra no CLI;
- [ ] orquestrador do meu docker - interface http para saber qual container ligar;
  - Cachear responses, keep-alive enquanto liga...
- [ ] implementar permissões ao agente de mock - testar como executar os subcomandos...

## License

ISC
