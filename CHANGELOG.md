# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

## [1.0.1] - 2026-08-19

Web dashboard refresh: light/dark theme toggle, reorganized sidebar, and collapsible navigation.

### Added

- Web frontend: light/dark theme toggle (dark by default), persisted in `localStorage`.
- Web frontend: per-page document titles and meta descriptions; page headers show a short description subtitle.
- Web frontend: favicon switches to an alert variant when an AI response finishes while the tab is unfocused, restored when the page is opened again.

### Changed

- Web frontend: reorganized the admin sidebar — main menu at the top, "New chat" + chat history in the middle, and a bottom Config menu for less-used items (Sessions, Channels, Audit, Usage, Settings).
- Web frontend: mobile menu drawer now mirrors the full sidebar layout.
- Web frontend: header hamburger collapses/expands the desktop sidebar to icon-only mode (state persisted); brand moved to the left and the status pill to the right.

### Fixed

### Removed

## [1.0.0] - 2026-08-18

First public release of Koris Assistant.

### Added

- Autonomous AI agent framework in TypeScript with a main agent, tool-call pipeline, and executor worker loop.
- Pluggable channel system: Telegram, WhatsApp, terminal UI (`--tui`), and web dashboard (port 3000).
- LLM provider support for Ollama, NVIDIA, and Mock, with serial/concurrent queue control via `ai.parallel`.
- Persistent SQLite memory: sessions, short-term messages, long-term memories (summary/fact/lesson/reminder), and learned skills.
- Summarizer sub-agent to condense long conversations into memories.
- Heartbeat sub-agent for scheduled beats with cron expressions; dashboard and `beats/*` tools to manage them.
- Default heartbeat sync from `heartbeats.default.json`, including a daily `__koris_clear_images__` beat that purges the images table without an LLM call.
- Skills system: markdown skill definitions under `skills/` synced into the database at startup and on file changes.
- Tools: `curl_request` (domain allowlist), `search_engine` (SerpAPI), and beat CRUD (`set_beat`, `list_beats`, `update_beat`, `delete_beat`).
- Security gate for outbound URLs and safe child-process execution for shell tools.
- Web frontend (React 19 + Vite + Tailwind): admin dashboard, multi-session chat with SSE streaming, memories, heartbeats, skills, settings, and queue visibility.
- Image support end-to-end: attach images in Telegram, WhatsApp, and web chat; store in a dedicated `images` table; forward to vision-capable providers with analysis instructions; preview and lightbox in the web UI; show a fallback when a stored image was deleted.
- Onboarding CLI (`pnpm onboard`), settings validation (`pnpm validate`), and provider health checks.
- Vitest test suite with optional Stryker mutation testing.

### Changed

- Message gateway accepts `{ text, images? }` payloads instead of plain strings.
- Chat history API returns `images` and `missingImages` per message for dashboard hydration.
- Web chat API accepts up to 10 base64 images per message; JSON body limit raised to 25 MB.

### Removed

- `execute-command` tool.
