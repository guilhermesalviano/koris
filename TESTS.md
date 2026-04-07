# opencrawdio Tests

Comprehensive test suite for CLI and Telegram interfaces.

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage

# Run security tests only
pnpm test tests/security

# Run specific security test category
pnpm test tests/security/path-traversal.test.ts
```

## Test Structure

```
tests/
├── unit/                      # Unit tests
│   ├── agent/
│   │   ├── processor.test.ts      # Message processor tests
│   │   └── commands.test.ts       # Command handler tests
│   ├── sub-instructions/
│   │   ├── detect-instruction.test.ts  # Instruction detection tests
│   │   ├── read-file.test.ts           # File reading tests
│   │   └── list-directory.test.ts      # Directory listing tests
│   └── telegram/
│       └── handlers.test.ts       # Telegram bot handler tests
└── security/                  # Security tests (108 tests)
    ├── path-traversal.test.ts     # Path traversal protection
    ├── command-injection.test.ts   # Command injection protection
    ├── input-validation.test.ts    # Input validation & edge cases
    ├── credential-exposure.test.ts # Secret & credential protection
    ├── markdown-injection.test.ts  # Markdown injection protection
    ├── authorization.test.ts       # Access control & permissions
    └── README.md                   # Security test documentation
```

## Test Coverage

### Unit Tests
- **Message Processor**: Command routing, instruction detection, Markdown escaping
- **Command Handler**: All commands (/start, /help, /status, /exit, etc.)
- **Instruction Detection**: Pattern matching for read, write, list, search, execute
- **File Operations**: Reading files, listing directories, error handling
- **Telegram Handlers**: Message processing, bot integration, Markdown formatting

### Security Tests (108 tests)
- **Path Traversal**: 12 tests - Directory traversal attacks, absolute paths, symlinks
- **Command Injection**: 13 tests - Shell metacharacters, parameter injection, environment vars
- **Input Validation**: 22 tests - Long inputs, Unicode, ReDoS, type confusion
- **Credential Exposure**: 17 tests - Environment files, SSH keys, API tokens, secrets
- **Markdown Injection**: 23 tests - Telegram escaping, XSS-like patterns, Unicode attacks
- **Authorization**: 22 tests - Approval workflows, privilege escalation, rate limiting

See `tests/security/README.md` for detailed security test documentation.

## Writing New Tests

### Example Test

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from './myModule';

describe('My Module', () => {
  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });
});
```

### Mocking

```typescript
import { vi } from 'vitest';

// Mock a module
vi.mock('./module', () => ({
  function: vi.fn(),
}));

// Mock implementation
vi.mocked(function).mockReturnValue('mocked value');
```

## CI/CD Integration

### Main Test Workflow
Add to `.github/workflows/test.yml`:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '24'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test
```

### Security Test Workflow
See `.github/workflows/security-tests.yml` for automated security testing that runs:
- On every push to main/develop
- On all pull requests
- Daily at 2 AM UTC (scheduled)
- On manual workflow dispatch

## Notes

- Tests use Vitest (fast, ESM-native)
- Mocks are used for external dependencies (Telegram bot, file system)
- Tests organized by category (unit/ and security/)
- Tests run in Node environment
- Security tests validate against OWASP Top 10 vulnerabilities
- All security tests must pass before merging to main

## Security Test Results

Current security test status: **3 critical issues found**

See `SECURITY-RESULTS.md` for:
- Detailed vulnerability descriptions
- Impact analysis
- Fix recommendations
- Action items

**Critical Issues**:
1. ❌ Path traversal vulnerability (absolute path access)
2. ❌ Directory listing outside project
3. ⚠️ Command detection issue with shell operators

All critical issues must be resolved before production deployment.
