# GitHub Actions Workflows

This directory contains CI workflows for linting, security tests, and CodeQL.

## Workflows

### `lint.yml` — Lint

- **Trigger**: push (main/develop)
- **What it does**:
  - Sets up pnpm (pinned)
  - Sets up Node
  - Installs dependencies from repo root
  - Runs `pnpm lint` (turbo, TypeScript typecheck across packages)

### `tests.yml` — Security Tests

- **Trigger**: push (main/develop), PR (main), manual dispatch
- **Jobs**:
  - `security-tests`: runs the security test suite (Vitest) for the client package (`pnpm --filter koris-agent ...`)
  - `security-analysis`: runs `pnpm audit` and Trivy, uploads SARIF

### `codeql.yml` — CodeQL Analysis

- **Trigger**: scheduled + manual dispatch
- **What it does**:
  - Runs GitHub CodeQL analysis for JS/TS

## Toolchain pinning

- pnpm: **10.18.3** (`pnpm/action-setup@v5` with `version: 10.18.3`)
- Node: **24.x**
