# opencrawdio Tests

Comprehensive test suite for TUI and Telegram interfaces.

Run from `apps/client` (or use `pnpm -C apps/client ...` from repo root).

## Running Tests

```bash
# Run all tests
pnpm -C apps/client test

# Watch mode
pnpm -C apps/client test:watch

# UI mode
pnpm -C apps/client test:ui

# Coverage
pnpm -C apps/client test:coverage

# Security tests only
pnpm -C apps/client test tests/security
```

## Test Structure

```
tests/
├── unit/                      # Unit tests
│   ├── agent/
│   ├── sub-instructions/
│   └── telegram/
└── security/                  # Security tests
    └── README.md              # Security test documentation
```

## CI/CD Integration

CI is configured under `.github/workflows/`:

- `lint.yml` runs `pnpm exec tsc --noEmit`
- `tests.yml` runs the security test suite (Vitest)

See `/.github/workflows/README.md` for details.
