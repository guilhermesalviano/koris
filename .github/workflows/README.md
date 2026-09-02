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

### `release-desktop.yml` — Release Desktop

- **Trigger**: a GitHub Release being `published` (or manual `workflow_dispatch` with a tag)
- **What it does**:
  - Matrix over `ubuntu-latest`, `macos-13` (Intel), `macos-14` (Apple Silicon), `windows-latest`
  - Builds server + web + the Electron shell, then `pnpm desktop:stage` bundles a
    production `node_modules` (with `better-sqlite3`) and a standalone Node runtime
  - `electron-builder --publish always` builds the installers (.dmg / .exe / .AppImage / .deb)
    and uploads them as assets on the triggering Release
- **Secrets**: none required (uses `GITHUB_TOKEN`). Code signing is not wired yet —
  see `apps/desktop/features/packaging.md`.

### `codeql.yml` — CodeQL Analysis

- **Trigger**: scheduled + manual dispatch
- **What it does**:
  - Runs GitHub CodeQL analysis for JS/TS

### `auto-assign.yml` — Auto Assign

- **Trigger**: pull request opened/reopened/marked ready for review
- **What it does**:
  - Assigns the PR to its author, via [`kentaro-m/auto-assign-action`](https://github.com/kentaro-m/auto-assign-action)
  - Configured in `.github/auto_assign.yml` (no reviewer auto-assignment, skips PRs titled with `wip`)

## Toolchain pinning

- pnpm: **10.18.3** (`pnpm/action-setup@v6` with `version: 10.18.3`)
- Node: **24.x**
