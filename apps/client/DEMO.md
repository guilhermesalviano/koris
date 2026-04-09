# opencrawdio Demo

Run from `apps/client` (or use `pnpm -C apps/client ...` from repo root).

## Quick Start

### 1) TUI Mode (easiest to test)

No Telegram bot needed:

```bash
pnpm -C apps/client dev:tui
```

Then try:

```
/help
read package.json
list src
search for config
/exit
```

### 2) Telegram Mode

1. Create `.env` from the example:

   ```bash
   cp apps/client/.env.example apps/client/.env
   # edit apps/client/.env and set TELEGRAM_BOT_TOKEN
   ```

2. Run:

   ```bash
   pnpm -C apps/client dev
   ```

3. Open Telegram and message your bot.

## Notes

- Telegram connectivity is provided by the reusable package in `apps/telegram-bot`.
- The TUI runner is provided by `apps/assistant-tui`.
