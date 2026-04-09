# opencrawdio Tests

Comprehensive test suite for TUI and Telegram interfaces.

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

# Security tests only (client)
pnpm --filter opencrawdio test tests/security
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

- `lint.yml` runs `pnpm lint` (turbo, TypeScript typecheck across packages)
- `tests.yml` runs the security test suite (Vitest) via `pnpm --filter opencrawdio ...`

See `/.github/workflows/README.md` for details.
