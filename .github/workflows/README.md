# GitHub Actions Workflows

This directory contains the CI/CD workflows for quality checks, automated testing, security validations, CodeQL analysis, and desktop release builds.

## Workflows

### `ci.yml` — Unified CI Pipeline

- **Trigger**:
  - `push`: branches `[ main, develop ]`
  - `pull_request`: branches `[ main, develop ]`
  - `workflow_dispatch`
- **Concurrency**: Automatically cancels in-progress runs for the same branch/PR (`cancel-in-progress: true`).
- **Parallel Jobs**:
  1. **`lint` (Code Quality & Type Check)**:
     - Runs `pnpm lint` (core & server TypeScript type-check)
     - Runs `pnpm lint:client` (web SPA client type-check)
     - Runs `pnpm lint:desktop` (Electron desktop shell type-check)
     - Runs `pnpm validate` (system settings & schema validation)
  2. **`test` (Unit & Integration Tests)**:
     - Runs Vitest test suite with V8 coverage (`pnpm run test:coverage --reporter=verbose`)
     - Strictly fails CI on test failures
     - Evaluates code coverage against baseline guards (lines: 74%, statements: 74%, functions: 77%, branches: 67%) to prevent coverage regression, aiming towards an 80% target
     - Posts structured summary table to `$GITHUB_STEP_SUMMARY`
     - Uploads coverage artifact and Codecov report
  3. **`build` (Production Build Verification)**:
     - Runs `pnpm build` (core server compilation + Vite client build)
     - Runs `pnpm build:desktop` (desktop shell compilation)
  4. **`security` (Security Validations)**:
     - Scans git history for exposed credentials/API keys with **Gitleaks** (`gitleaks/gitleaks-action@v2`)
     - Audits newly introduced dependencies on PRs for known vulnerabilities and licensing with **GitHub Dependency Review** (`actions/dependency-review-action@v4`)

### `codeql.yml` — CodeQL Static Analysis

- **Trigger**:
  - `push` and `pull_request` on `[ main, develop ]` filtered to relevant code paths (`core/**`, `plugins/**`, `apps/**`, `package.json`, `pnpm-lock.yaml`)
  - Scheduled weekly run (`0 2 * * 1`)
  - Manual dispatch (`workflow_dispatch`)
- **What it does**:
  - Runs GitHub CodeQL analysis for JavaScript / TypeScript using the `security-extended` query suite.

### `release-desktop.yml` — Release Desktop

- **Trigger**: a GitHub Release being `published` (or manual `workflow_dispatch` with a tag)
- **What it does**:
  - Matrix over `ubuntu-latest`, `macos-14` (arm64), `windows-latest` (x64)
  - Builds server + web + the Electron shell, stages bundled dependencies, and builds installers (.dmg / .exe / .AppImage / .deb)
  - Attaches executables to the triggering Release via GitHub CLI.

### `auto-assign.yml` — Auto Assign

- **Trigger**: pull request opened/reopened/marked ready for review
- **What it does**:
  - Assigns the PR to its author, configured in `.github/auto_assign.yml`.

## Local Quality Hooks (Husky)

- A Git hook is configured via **Husky** (`.husky/pre-push`):
  - Automatically runs before `git push`:
    - `pnpm lint`
    - `pnpm lint:client`
    - `pnpm lint:desktop`
    - `pnpm validate`
    - `pnpm test`
  - Prevents pushing broken builds, type errors, or test regressions to remote branches.

## Toolchain Pinning

- **pnpm**: `10.18.3` (`pnpm/action-setup@v6`)
- **Node**: `24.x` (`actions/setup-node@v6`)
