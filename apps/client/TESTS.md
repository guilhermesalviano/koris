# opencrawdio Tests

Comprehensive test suite for all interfaces (TUI, Web, Telegram).

Run from the repo root.

## Running Tests

```bash
# Run all tests across the monorepo
pnpm test

# Client-only tests (watch / UI)
pnpm --filter opencrawdio test:watch
pnpm --filter opencrawdio test:ui

# Coverage (client)
pnpm --filter opencrawdio test:coverage

# Specific test file
pnpm --filter opencrawdio test tests/unit/ai/ollama.provider.test.ts
```

## Test Structure

```
tests/
├── unit/                           # Unit tests (42 total)
│   ├── agent/
│   │   ├── commands.test.ts        # 19 tests - Command handler
│   │   └── processor.test.ts       # 13 tests - Message processor
│   ├── ai/
│   │   ├── system-info.test.ts     # 1 test - System prompts
│   │   ├── tools.test.ts           # 2 tests - Tool schemas
│   │   ├── mock.provider.test.ts   # 1 test - Mock provider
│   │   └── ollama.provider.test.ts # 6 tests - Ollama provider & tool execution
│   └── sub-instructions/           # (extensible for other instruction types)
└── security/                       # Security tests
    └── README.md                   # Security test documentation
```

## Test Coverage

### Commands (19 tests)
- All slash commands (/start, /help, /status, /stats, /clear, /reset, /exit)
- Telegram vs TUI response formatting differences
- Error handling and invalid commands

### Processor (13 tests)
- Message routing to commands and AI providers
- Instruction detection (read, write, list, search, execute)
- Error propagation and logging

### AI Providers (8 tests)
- Mock provider basic response
- Ollama streaming and timeout handling
- Tool call detection and execution
- Response parsing for tool_calls vs content

### System Info (1 test)
- Context-aware system prompts per interface

### Tools (2 tests)
- Tool schema definitions for Ollama

## Test Configuration

### Provider Selection

Tests automatically use `AI_PROVIDER=mock` when:
- `NODE_ENV=test` is set, OR
- `VITEST=true` is set

This ensures tests run without requiring an Ollama server.

### Environment

Tests set up environment via `vitest.config.ts`:
```typescript
env: { NODE_ENV: 'test' }
```

## CI/CD Integration

CI is configured under `.github/workflows/`:

- `lint.yml` - Runs `pnpm lint` (TypeScript typecheck)
- `tests.yml` - Runs `pnpm test` via Vitest

See `/.github/workflows/README.md` for details.

## Adding New Tests

### Testing a New Command

Add to `tests/unit/agent/commands.test.ts`:

```typescript
describe('handleCommand /mycommand', () => {
  it('should respond correctly for tui', () => {
    const result = handleCommand('/mycommand', {
      source: 'tui',
      session: { messageCount: 1, startTime: new Date() },
    });
    
    expect(result.handled).toBe(true);
    expect(result.response).toContain('expected text');
    expect(result.action).toBe('none');
  });

  it('should format for Telegram', () => {
    const result = handleCommand('/mycommand', { source: 'telegram' });
    expect(result.response).toContain('*bold*'); // Telegram Markdown
  });
});
```

### Testing AI Provider Integration

```typescript
it('should detect tool_calls in response', async () => {
  const provider = new OllamaProvider(mockConfig);
  const response = await provider.chat([{ role: 'user', content: 'read file' }]);
  
  expect(response).toContain('tool_calls');
  // Tool executor should have been called
});
```

### Mocking the Provider

Use the mock provider for tests without Ollama:

```typescript
const mockProvider = new MockProvider(config);
const response = await mockProvider.chat([...]);
expect(response).toBe('mock response');
```

## Debugging Tests

```bash
# Run single test file with debug output
DEBUG=* pnpm test tests/unit/agent/commands.test.ts

# Watch mode for iterative development
pnpm test:watch

# UI mode for interactive test runner
pnpm test:ui
```

## Performance Notes

- All 42 tests complete in ~380ms
- Mock provider ensures consistent fast tests
- Tool execution tests isolated with proper validation
- No file system side effects from tests

## Known Test Limitations

1. **Web Interface**: Not yet covered by unit tests (can be added with DOM testing library)
2. **Telegram Integration**: Uses mock Telegram API (real integration tested manually)
3. **Tool Execution**: Validated with mock file paths to prevent side effects
