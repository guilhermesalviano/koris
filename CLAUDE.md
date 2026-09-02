# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start here

This repo already has a detailed **AGENTS.md** at the repo root — read it first. It covers the full architecture (message flow, AI providers, tools, plugins/skills, DB schema, web frontend) and conventions. This file only adds the commands quick-reference and a couple of things AGENTS.md doesn't spell out (single-test invocation, an rtk-prefix instruction found in `.github/copilot-instructions.md`).

The public website, plugins marketplace, and docs live in a separate independent repo, `koris-hub` (`git@github.com:guilhermesalviano/koris-hub.git`), which deploys itself to GitHub Pages. This repo no longer builds or serves a website.

## Commands

- Install: `pnpm install` (never `npm`/`yarn`)
- Build (required before `pnpm app`): `pnpm build`
- Run: `pnpm app` (web on :3000; add `--tui` for TUI, `telegram` for Telegram mode)
- Type-check: `pnpm lint` (server), `pnpm lint:client` (`apps/web/`) — must pass, strict TS (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
- Test suite: `pnpm test`
- Single test file: `pnpm vitest run tests/unit/path/to/file.test.ts`
- Single test by name: `pnpm vitest run -t "test name"` (combine with a file path to scope further)
- Watch mode: `pnpm test:watch`
- Coverage: `pnpm test:coverage`
- Mutation testing: `pnpm test:mutation` (Stryker; only mutates the files listed in `stryker.config.json`)
- Validate settings: `pnpm validate`
- Wipe local DB: `pnpm clear:memory`

Run `pnpm test` and `pnpm lint` before considering a change done.

## Note on `.github/copilot-instructions.md`

That file instructs prefixing shell commands with a local `rtk` CLI wrapper (a token-saving proxy installed at `~/.local/bin/rtk`, not a repo dependency) and points to AGENTS.md for agent roles. It's a personal tooling preference rather than project architecture — mentioning it here so you're aware it exists, but it isn't reproduced as a requirement.
