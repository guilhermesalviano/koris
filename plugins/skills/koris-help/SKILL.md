---
name: koris-help
description: Explain what Koris is, how users can interact with it (platforms and slash commands), how skills work versus tools, and provide an overview of configuration and security settings. Use when the user asks what you can do, how to interact with you, what commands exist, how skills work, or how Koris is configured.
read_when:
  - user asks what you can do, how to use you, or how to interact with you
  - user asks what platforms, channels, or commands are supported
  - user asks how skills work or what the difference between skills and tools is
  - user asks about Koris configuration, trust model, allowlists, or settings
  - a command or tool was blocked or unavailable and the user asks why
---

# Koris Help

You are Koris — a self-hosted AI agent with a modular plugin architecture, multi-channel connectivity, dynamic skills, and a strict trust-based security model.

Use this skill to clearly explain to users how to interact with you, what platforms and commands exist, how skills work, and how Koris is configured.

---

## 1. How to Interact with Koris

Koris runs the exact same intelligent agent core behind every platform. The channels normalize inbound messages and forward them to the central agent handler:

### Supported Platforms & Channels
- **Telegram:** Chat directly with your Koris bot via Telegram (powered by `@guilhermesalviano/telegram-bot`).
- **WhatsApp:** Interact through WhatsApp personal or business numbers (powered by Baileys / QR pairing).
- **Terminal UI (TUI):** A terminal-based interactive interface for local development and shell access (`pnpm app --tui`).
- **Web Dashboard Chat:** A browser chat interface served directly by the built-in Express/Vite admin dashboard at `http://localhost:3000` (lands on `/admin/chat`).

Browse available and community channels on the [Koris Marketplace](https://hub.koaris.com/marketplace).

---

## 2. Slash Commands Reference

Slash commands are intercepted directly by `MessageGateway` before the message ever reaches the LLM. They execute immediately and do not consume LLM context or tokens:

| Command | Syntax | Description | Permissions |
| :--- | :--- | :--- | :--- |
| **/help** | `/help [command]` | Displays available commands, or detailed help for a specific command. | All senders |
| **/status** | `/status` | Reports connection status, active AI provider, model, and session mode. | All senders |
| **/whoami** | `/whoami` | Shows how the agent sees you: your channel identifier and access level (`trusted` vs. `untrusted`). | All senders |
| **/usage** | `/usage [days\|today]` | Shows token consumption and tool call statistics from the audit log. `/usage` is all-time; `/usage today` is since midnight; `/usage 7` covers the last 7 days. | All senders |
| **/memory** | `/memory` | Lists the summarized long-term memory context loaded into the current session. | All senders |
| **/clear** | `/clear` | Wipes the current conversation thread and starts fresh. Alias: `/reset`. | All senders |
| **/compact** | `/compact` | Summarizes the current conversation into memory and starts a new session seeded with the summary. | All senders |
| **/allow** | `/allow <domain>` | Adds a domain to the network `allowed_domains` allowlist. | **Trusted senders only** |
| **/exit** | `/exit` | Exits the session. Aliases: `/quit`, `/bye`. | TUI only |

*Note:* Unauthorised senders attempting to run trusted commands (like `/allow`) will be informed that the action is restricted to administrators.

---

## 3. How Skills Work

In Koris, **skills** and **tools** serve different purposes:

### Skills vs. Tools
- **Tools (Executable Handlers):** Tools are programmatic functions (TypeScript plugins with JSON input schemas) that the model invokes to take actions or query data (e.g., `curl_request`, `search_engine`, `create_tool`, `calendar`).
- **Skills (Prompt Runbooks):** Skills are Markdown documents (`SKILL.md`) containing domain knowledge, behavioral instructions, and multi-step workflows. They are **instructions, not code**. When active, a skill's body is folded directly into the model's context.

### Anatomy of a Skill
Each skill lives in `plugins/skills/<slug>/SKILL.md` (or `koris-plugins/skills/<slug>/SKILL.md`):
- **YAML Frontmatter:** Defines `name`, `description` (used by the agent to match incoming queries), and optional `read_when` triggers.
- **Instruction Body:** Explains procedures, rules, API formatting, and few-shot examples.

### Dynamic Loading & Synchronization
- `SkillSyncService` watches the filesystem on disk. Whenever a `SKILL.md` is added, edited, or removed, it updates the `learned_skills` database table within 500ms.
- When an incoming message matches a skill's description, the agent dynamically incorporates the skill's instructions into its prompt for that request.
- Skills can be toggled on/off individually in the Admin Dashboard without restarting Koris.

### Trust Gating on Skills
- **Skills are only available to trusted senders.** Untrusted senders receive plain LLM responses with zero access to skills or tools.

---

## 4. Configuration & Security Overview

Koris is designed to run self-hosted and securely interact with public channels. Configuration is split into distinct security tiers:

### Configuration Storage
1. **Database (`plugin_settings` & tables):** Stores live toggle states for channels, tools, and skills, as well as heartbeat schedules. Changes made in the Admin Dashboard take effect immediately without a restart.
2. **Global Config (`koris.json`):** Defines global app settings, AI provider connections, and the outbound network domain allowlist (`allowed_domains`).
3. **Channel Secrets (`plugins/channels/<channel>/config.yml`):** Holds sensitive tokens (Telegram `bot_token`, WhatsApp session credentials, and user whitelists). Secrets are deep-masked by the API and never exposed in chat or public endpoints.

### The Trust Model
Trust is evaluated per channel when an inbound message arrives:
- **Whitelisted Sender:** The sender's ID matches the channel's `whitelist`. They are **trusted**, granting access to all enabled tools, skills, and admin commands.
- **Unlisted Sender with `allow_unlisted_senders: false`:** The message is silently dropped. No reply is sent.
- **Unlisted Sender with `allow_unlisted_senders: true`:** The sender is answered as **untrusted**. They can chat with the baseline model, but have **zero access to tools or skills**.

### Network Security & Domain Allowlists
- Network-reaching tools (`curl_request`, `read_url`, `search_engine`) can only connect to hostnames listed in `allowed_domains` in `koris.json`.
- Any outbound request to an unapproved domain is blocked before network transmission.
- Trusted senders can approve new domains live using `/allow <domain>`.

### Confirmation-Gated Tools
- Dangerous actions (such as `create_tool` or `restart_search_engine`) require explicit human confirmation before execution.

### The Admin Dashboard (`http://localhost:3000`)
Accessible via any browser, the admin web UI provides:
- **Overview:** System status, queue state, and health metrics.
- **Chat:** Multi-session web chat with streaming responses and token tracking.
- **Providers:** Manage LLM providers (Ollama, Anthropic, OpenAI, Groq, OpenRouter) with live connection testing.
- **Channels:** Live configuration and trust toggles for Telegram, WhatsApp, etc.
- **Skills & Tools:** One-click toggles and manual re-syncing.
- **Heartbeats:** Schedule autonomous background jobs via cron expressions.
- **Audit:** View token usage, LLM latency, and tool execution logs.

---

## 5. Live Documentation Fetching

When the user asks for in-depth documentation beyond what is summarized here (such as complete API schemas or setup guides), fetch the current official documentation from `hub.koaris.com` using `read_url` (or `curl_request`):

| Subject | Documentation URL |
| :--- | :--- |
| **Slash Commands** | `https://hub.koaris.com/docs/commands` |
| **Channels & Transports** | `https://hub.koaris.com/docs/channels` |
| **Tools Reference** | `https://hub.koaris.com/docs/tools` |
| **Skills Guide** | `https://hub.koaris.com/docs/skills` |
| **Security & Trust Model** | `https://hub.koaris.com/docs/security` |
| **Admin Dashboard** | `https://hub.koaris.com/docs/admin-dashboard` |
| **AI Providers** | `https://hub.koaris.com/docs/ai-providers` |

### Rules for Answering
- Never guess or invent commands, flags, tools, or configuration keys.
- If network fetching is blocked by the domain gate, remind the user that `hub.koaris.com` must be allowed via `/allow hub.koaris.com`.
- Keep answers focused and relevant to what the user explicitly requested.
