# opencrawdio Agent System

**AI Coding Assistants**: This document describes the agent architecture and capabilities of opencrawdio. Use this as context when working with this codebase.

## Architecture Overview

opencrawdio is a multi-interface AI agent system that processes user messages and executes coding tasks. The system supports both TUI and Telegram Bot interfaces with a unified backend.

```
┌─────────────────────────────────────────────────────────┐
│                    User Interfaces                      │
├──────────────────────┬──────────────────────────────────┤
│   TUI Interface      │     Telegram Bot                 │
│   (interface.ts)     │     (bot.ts)                     │
└──────────┬───────────┴────────────┬─────────────────────┘
           │                        │
           └────────────┬───────────┘
                        ▼
           ┌────────────────────────┐
           │   Message Processor    │
           │   (processor.ts)       │
           └────────────┬───────────┘
                        │
           ┌────────────┴───────────┐
           │                        │
           ▼                        ▼
    ┌─────────────┐        ┌──────────────┐
    │  Commands   │        │ Instructions │
    │(commands.ts)│        │  Detection   │
    └─────────────┘        └──────────────┘
```

## Core Components

### 1. Message Processor (`apps/client/src/agent/processor.ts`)

**Purpose**: Central hub for processing all user messages regardless of interface.

**Functions**:
- `handle(message: string, source: string): Promise<string>`
  - Main entry point for all message processing
  - Routes to appropriate handler (commands vs instructions)
  - Returns formatted response string

**Message Flow**:
1. Receives message from interface (TUI or Telegram)
2. Checks if message is a command (starts with `/`)
3. If command: delegates to centralized command handler
4. If not command: detects instruction type and handles accordingly
5. Returns response to calling interface

**Instruction Types**:
- `read_file` - Read file contents
- `write_file` - Create or modify files
- `list_dir` - List directory contents
- `execute_command` - Execute shell commands
- `search` - Search in files
- `unknown` - Unrecognized instruction

### 2. Command Handler (`apps/client/src/agent/commands.ts`)

**Purpose**: Centralized command handling for both TUI and Telegram interfaces.

**Key Functions**:
- `handleCommand(command: string, context: CommandContext): CommandResult`
- `isCommand(message: string): boolean`
- `getAvailableCommands(source: string): string[]`

**Available Commands**:
| Command | tui | Telegram | Description |
|---------|-----|----------|-------------|
| `/start` | ✅ | ✅ | Welcome message |
| `/help` | ✅ | ✅ | Show available commands |
| `/status` | ✅ | ✅ | Show bot/session status |
| `/stats` | ✅ | ❌ | Show tui session statistics |
| `/clear` | ✅ | ✅ | Clear screen/history |
| `/reset` | ✅ | ✅ | Reset session |
| `/exit` | ✅ | ❌ | Exit tui (not applicable for Telegram) |

**CommandContext Interface**:
```typescript
interface CommandContext {
  source: string;
  session?: {
    messageCount: number;
    startTime: Date;
  };
  rl?: readline.Interface;
}
```

**CommandResult Interface**:
```typescript
interface CommandResult {
  response?: string;        // Text response to display
  action?: 'exit' | 'clear' | 'reset' | 'none';  // Action to perform
  handled: boolean;         // Whether command was recognized
}
```

### 3. tui Interface (`apps/client/src/tui/interface.ts`)

**Purpose**: Terminal-based interface with rich formatting and session management.

**Features**:
- ANSI color-coded output (cyan prompts, green assistant, red errors)
- Session tracking (message count, uptime)
- Graceful Ctrl+C handling
- Thinking indicators during processing
- Response formatting (highlighted lists, code blocks)

**Session State**:
```typescript
interface SessionState {
  messageCount: number;
  startTime: Date;
}
```

**Color Scheme**:
- `cyan` - User prompts and highlights
- `green` - Assistant responses and success messages
- `red` - Errors
- `yellow` - Warnings
- `gray/dim` - Secondary information

### 4. Web Interface (`apps/client/src/channels/web/`)

**Purpose**: Browser-based chat interface served via Express.

**Architecture**:
- `server.ts` - Express server with SSE streaming
- `public/index.html` - Main chat UI (Tailwind CSS + DM fonts)
- `public/main.js` - Frontend logic with markdown rendering
- `public/styles.css` - Custom styles (grid bg, scrollbars, code labels)

**Features**:
- Real-time SSE streaming from `/api/chat`
- Markdown rendering with syntax highlighting
- Tool execution response handling
- Server health check with status indicator
- Character count for input (max 4000 chars)

### 5. Telegram Bot (via `apps/telegram-bot`)

**Purpose**: Telegram interface for remote access to agent capabilities.

**Message Format**: Uses Telegram Markdown for formatting responses.

**Integration**: The main app (`apps/client`) wires Telegram events into `handle(message, 'telegram')` using the reusable `assistant-telegram-bot` module from `apps/telegram-bot`.


## Agent Capabilities

### Current (Ollama Integration + Tool Execution)

The agent now provides:

1. **AI Provider Integration**
   - Ollama provider with streaming responses
   - Mock provider for testing
   - Tool calling with automatic detection and execution
   - Configurable timeouts for remote models (IDLE_TIMEOUT=90s, HARD_TIMEOUT=15m)

2. **File Operations** (via Ollama tool calls)
   - `read_file` - Read file contents with size limits
   - `write_file` - Create/modify files with validation
   - `list_dir` - List directory contents
   - All paths validated to prevent directory traversal attacks

3. **Command Execution**
   - `execute_command` - Run shell commands with output capture
   - Executed by AI model as tool calls

4. **Search Operations**
   - `search` - Search files with pattern matching
   - Returns file contents matching patterns

5. **System Information**
   - Context-aware system prompts per interface
   - Tool schemas automatically passed to AI model

### Tool Execution Architecture

Tool calls flow:
```
User Message → Ollama Chat → Detects tool_calls in response
              ↓
        Tool Executor (tool-executor.ts)
              ↓
   [read_file | write_file | list_dir | search | execute_command]
              ↓
        Results formatted as JSON → Sent back to AI for continuation
              ↓
        Final response streamed to user
```

## Tool Detection Patterns

The agent detects instructions using pattern matching:

### Read File
**Triggers**: `read`, `show me`, `cat`
**Pattern**: `/(read|show|cat)\s+["']?([^\s"']+)["']?/i`
**Example**: "read src/config.ts"

### Write File
**Triggers**: `write`, `create file`, `save`
**Pattern**: `/(write|create|save).*?["']?([^\s"']+)["']?/i`
**Example**: "create file config.json"

### List Directory
**Triggers**: `list`, `ls`, `show directory`
**Pattern**: `/(list|ls|directory)\s+["']?([^\s"']+)["']?/i`
**Example**: "list src/"

### Execute Command
**Triggers**: `run`, `execute`, `command`
**Pattern**: `/(run|execute)(?:\s+command)?\s+["']?(.+?)["']?$/i`
**Example**: "run npm install"

### Search
**Triggers**: `search`, `find`
**Pattern**: `/(search|find)\s+(?:for\s+)?["']?(.+?)["']?$/i`
**Example**: "search for config"

## Extension Guide

### Adding a New Command

1. Add command handler in `apps/client/src/agent/commands.ts`:
```typescript
case '/mycommand':
  return handleMyCommand(context);
```

2. Implement handler function:
```typescript
function handleMyCommand(context: CommandContext): CommandResult {
  const message = context.source === 'telegram'
    ? `*Telegram formatted response*`
    : `tui formatted response`;
  
  return {
    response: message,
    action: 'none',
    handled: true,
  };
}
```

3. Update command list in `getAvailableCommands()` if needed.

### Adding a New Instruction Type

1. Add type to `Instruction` interface in `processor.ts`:
```typescript
interface Instruction {
  type: 'read_file' | 'write_file' | 'my_new_type' | ...;
  params: string;
}
```

2. Add detection pattern in `detectInstruction()`:
```typescript
if (lower.includes('my_trigger')) {
  return { type: 'my_new_type', params: extractedParams };
}
```

3. Add handler in `handleInstruction()`:
```typescript
case 'my_new_type':
  return mockMyNewType(instruction.params);
```

4. Implement mock function:
```typescript
function mockMyNewType(params: string): string {
  return `Response for ${params}`;
}
```

### Adding Ollama Integration

Ollama integration is now active with full tool support:

**Current Implementation** (`apps/client/src/ai/providers/ollama.ts`):
1. Streaming chat completions with timeout handling
2. Automatic tool call detection in responses
3. Tool execution via `tool-executor.ts`
4. Response parsing with JSON fallback for tool_calls
5. Comprehensive logging of all requests/responses

**Tool Schema Handling**:
```typescript
// Tools automatically passed to Ollama in system prompt
const tools = [
  { name: 'read_file', description: '...' },
  { name: 'write_file', description: '...' },
  { name: 'list_dir', description: '...' },
  { name: 'search', description: '...' },
  { name: 'execute_command', description: '...' }
];

// Model responds with tool_calls array
{
  "tool_calls": [{
    "name": "read_file",
    "parameters": { "path": "src/config.ts" }
  }]
}

// Results formatted and sent back to model for continuation
{
  "role": "tool",
  "content": "{ \"file_contents\": \"...\" }"
}
```

**Timeout Configuration** (for slow remote models):
- `IDLE_TIMEOUT`: 90s (time between chunks) - resets on each data chunk
- `HARD_TIMEOUT`: 15m (total request time) - prevents hung requests
- Configurable via environment variables

## Configuration

### Environment Variables

See `apps/client/.env.example` for required configuration:
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `LOG_LEVEL` - Logging level (info, debug, error)
- `ENVIRONMENT` - Environment name (dev, prod)

### Logging

Logger is configured in `apps/client/src/infrastructure/logger.ts`:
- Uses Winston for structured logging
- Outputs to console (JSON format) and files
- File transports: `logs/combined.log` (all) and `logs/error.log` (errors only)
- Includes request/response data from AI providers
- Maximum 5MB per file, 5 files rotation

**Logging Coverage**:
- All Ollama requests and responses
- Tool execution and results
- Errors with full stack traces
- Mock provider responses (for testing)

## Usage Examples

### TUI Usage
```bash
# Start tui
pnpm dev:tui

# Example session
> /help
[Shows available commands]

> read src/config.ts
[Ollama processes and executes read_file tool]

> /stats
[Shows session statistics]

> /exit
[Exits cleanly]
```

### Web Interface Usage
```bash
# Start web server (runs at http://localhost:3000)
pnpm dev

# Or with production build
pnpm build && pnpm start

# Then visit http://localhost:3000 in browser
```

Send messages and receive real-time SSE responses with tool execution.

### Telegram Usage
```
User: /start
Bot: 👋 Welcome to opencrawdio! [...]

User: read package.json
Bot: [Ollama executes read_file tool]

User: /status
Bot: ✅ Bot Status [...] 
```

## Testing

### Manual Testing
```bash
# Build project
pnpm build

# Test tui with AI provider
pnpm dev:tui

# Test web interface
pnpm dev  # Starts on http://localhost:3000

# Test with Ollama
# Ensure Ollama is running: ollama serve
# Set in .env: AI_PROVIDER=ollama, AI_BASE_URL=http://localhost:11434, AI_MODEL=gemma4:e2b
```

### Automated Testing
```bash
# Run all tests (unit tests default to mock provider)
pnpm test

# Tests for each component
- agents/commands: 19 tests
- agents/processor: 13 tests  
- AI providers (mock, ollama): 7 tests
- System info: 1 test
- Tools: 2 tests

Total: 42 tests passing
```

**Test Configuration**:
- Tests default to `AI_PROVIDER=mock` via `NODE_ENV=test` or `VITEST=true`
- No Ollama server needed for unit tests
- Integration tests can be added for live Ollama testing

## Security Considerations

1. **Command Execution**: All command executions should require user approval
2. **File Operations**: Validate paths to prevent directory traversal
3. **Token Management**: Never log or expose Telegram bot tokens
4. **Input Sanitization**: Validate and sanitize all user inputs
5. **Rate Limiting**: Implement rate limiting for Telegram bot

## Performance Notes

- tui interface uses async processing with visual feedback
- Telegram bot should use webhook mode for production (currently polling)
- Consider implementing message queuing for high-volume scenarios
- Response caching could improve repeated queries

## Dependencies

### Core
- `assistant-tui` - Reusable TUI runner
- `assistant-telegram-bot` - Telegram connection module (polling)
- `winston` - Structured logging
- `dotenv` - Environment configuration

### Development
- `typescript` - Type safety
- `tsx` - Development server with watch mode
- `@types/*` - TypeScript definitions

## File Structure

```
apps/
├── client/                     # main runnable app
│   ├── src/
│   │   ├── ai/                 # AI provider layer
│   │   │   ├── providers/      # ollama.ts, mock.ts
│   │   │   ├── worker/         # tool-executor.ts
│   │   │   └── prompt/         # system-info.ts, tools.ts
│   │   ├── agent/              # processor.ts, commands.ts
│   │   ├── channels/
│   │   │   ├── tui/            # TUI interface
│   │   │   └── web/            # Web interface (Express + public/)
│   │   └── infrastructure/     # logger.ts
│   ├── public/                 # Static assets (index.html, main.js, styles.css)
│   ├── tests/                  # Unit + security tests (vitest)
│   └── logs/                   # Runtime logs (combined.log, error.log)
├── assistant-tui/              # Reusable TUI module
├── telegram-bot/               # Reusable Telegram module
└── sh-compression/             # Utility module

.github/workflows/              # CI workflows (lint, test)
AGENTS.md                       # System architecture (this file)
README.md                       # Repo overview
```

## Contributing

When modifying the agent system:

1. **Maintain interface consistency**: Ensure both tui and Telegram interfaces work correctly
2. **Update this document**: Keep agent capabilities and patterns documented
3. **Follow TypeScript patterns**: Use proper types and interfaces
4. **Test both interfaces**: Verify changes work in tui and Telegram
5. **Handle errors gracefully**: Provide user-friendly error messages

## AI Assistant Guidelines

**When working on this codebase:**

1. **Use centralized command handler** (`apps/client/src/agent/commands.ts`) for all command-related changes
2. **Respect interface separation**: client-specific code in `apps/client/src/`, modules in `apps/*`
3. **Update command responses**: Ensure proper formatting for both Telegram (Markdown) and tui (ANSI colors)
4. **Mock before integrate**: Keep mock implementations until Ollama integration is ready
5. **Maintain session state**: tui has session state, Telegram should track per-user state

**Common patterns to follow:**
- Use `handleCommand()` for slash commands
- Use `detectInstruction()` for natural language instructions
- Use `handle()` as the universal entry point
- Format responses based on `source` parameter
- Return `CommandResult` from command handlers with appropriate `action` values

---

**Last Updated**: 2026-04-12
**Version**: 1.1.0
**Status**: Ollama integration complete with tool execution. Web interface added.
