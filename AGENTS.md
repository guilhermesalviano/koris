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
- `processUserMessage(message: string, source: 'telegram' | 'tui'): Promise<string>`
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
- `getAvailableCommands(source: 'telegram' | 'tui'): string[]`

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
  source: 'telegram' | 'tui';
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

### 4. Telegram Bot (via `apps/telegram-bot`)

**Purpose**: Telegram interface for remote access to agent capabilities.

**Message Format**: Uses Telegram Markdown for formatting responses.

**Integration**: The main app (`apps/client`) wires Telegram events into `processUserMessage(message, 'telegram')` using the reusable `assistant-telegram-bot` module from `apps/telegram-bot`.


## Agent Capabilities

### Current (Mock Implementation)

The agent currently provides mock responses for:

1. **File Operations**
   - Reading file contents
   - Writing/creating files
   - Listing directories

2. **Command Execution**
   - Shell command execution (requires approval)
   - Output display

3. **Search Operations**
   - File content search
   - Pattern matching

### Planned (Ollama Integration)

The system is designed to integrate with Ollama for:
- Natural language understanding
- Code analysis and generation
- Context-aware responses
- Tool calling capabilities

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

When integrating Ollama, replace mock implementations with real tool calls:

1. Create Ollama client wrapper in `apps/client/src/agent/ollama.ts`
2. Define tool schemas for Ollama function calling
3. Replace `mockReadFile`, `mockWriteFile`, etc. with real implementations
4. Add conversation history management
5. Implement streaming responses for better UX

**Tool Schema Example**:
```typescript
const readFileTool = {
  name: 'read_file',
  description: 'Read contents of a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' }
    },
    required: ['path']
  }
};
```

## Configuration

### Environment Variables

See `apps/client/.env.example` for required configuration:
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `LOG_LEVEL` - Logging level (info, debug, error)
- `ENVIRONMENT` - Environment name (dev, prod)

### Logging

Logger is configured in `apps/client/src/infrastructure/logger.ts`:
- Uses Winston for structured logging
- Outputs JSON format to console
- Includes timestamps and environment metadata

## Usage Examples

### tui Usage
```bash
# Start tui
pnpm -C apps/client dev:tui

# Example session
> /help
[Shows available commands]

> read src/config.ts
[Shows file contents]

> /stats
[Shows session statistics]

> /exit
[Exits cleanly]
```

### Telegram Usage
```
User: /start
Bot: 👋 Welcome to opencrawdio! [...]

User: read package.json
Bot: 📄 Reading file: package.json [...]

User: /status
Bot: ✅ Bot Status [...] 
```

## Testing

### Manual Testing
```bash
# Build project
pnpm -C apps/client build

# Test tui
pnpm -C apps/client dev:tui

# Test with production build
pnpm -C apps/client start:tui
```

### Future: Automated Testing
- Unit tests for command handlers
- Integration tests for message processing
- Mock Ollama responses for consistent testing

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
├── client/                 # main runnable app
│   ├── src/                # agent + tui + telegram integration
│   └── tests/              # unit + security tests (vitest)
├── assistant-tui/          # reusable TUI mini-module (assistant-tui)
│   └── src/
└── telegram-bot/           # reusable Telegram mini-module (assistant-telegram-bot)
    └── src/

.github/workflows/          # CI workflows
AGENTS.md                   # architecture notes
README.md                   # repo overview
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
- Use `processUserMessage()` as the universal entry point
- Format responses based on `source` parameter
- Return `CommandResult` from command handlers with appropriate `action` values

---

**Last Updated**: 2026-04-07
**Version**: 1.0.0
**Status**: Mock implementation, Ollama integration pending
