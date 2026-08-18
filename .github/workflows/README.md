# GitHub Actions Workflows

This directory contains CI workflows for linting, tests, and CodeQL.

## Workflows

### `lint.yml` — Lint

- **Trigger**: pull request (main/develop)
- **What it does**:
  - Sets up pnpm (pinned)
  - Sets up Node
  - Installs dependencies from repo root
  - Runs `pnpm lint` (server TypeScript type-check)
  - Runs `pnpm lint:client` (web frontend TypeScript type-check)

### `tests.yml` — Tests

- **Trigger**: pull request (main/develop)
- **Jobs**:
  - `test`: installs dependencies, builds, runs the Vitest suite with coverage
  - Coverage annotations and a coverage summary are posted as CI annotations
  - Uploads coverage to Codecov (single-package `coverage/` output)

### `codeql.yml` — CodeQL Analysis

- **Trigger**: scheduled + manual dispatch
- **What it does**:
  - Runs GitHub CodeQL analysis for JS/TS

## Toolchain pinning

- pnpm: **10.18.3** (`pnpm/action-setup@v6` with `version: 10.18.3`)
- Node: **24.x**
