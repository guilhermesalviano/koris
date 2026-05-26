# ──────────────────────────────────────────────────────────────
# Stage 1 — builder
# Installs all deps, builds all workspace packages, then creates
# a self-contained deployment folder via `pnpm deploy`.
# ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

# Install pnpm (bypass corepack — root package.json pins pnpm@8.5.1 which conflicts)
RUN npm install -g pnpm@10.18.3 --no-fund --no-audit

WORKDIR /repo

# Disable corepack strict mode so root package.json's pnpm@8.5.1 pin doesn't override
ENV COREPACK_ENABLE_STRICT=0

# Copy manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/client/package.json             ./apps/client/
COPY apps/assistant-tui/package.json      ./apps/assistant-tui/
COPY apps/telegram-bot/package.json       ./apps/telegram-bot/

# Install all dependencies (ignore lifecycle scripts — we build explicitly below)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source code for all packages
COPY apps/ ./apps/

# Build all packages in dependency order (turbo handles ordering)
RUN pnpm build

# Create a standalone deployment folder for the client app only.
# pnpm deploy resolves workspace packages and copies only prod deps.
RUN pnpm --filter koris-agent deploy --prod /app/deploy

# Copy runtime assets that are not part of the TypeScript build
COPY apps/client/public/   /app/deploy/public/
COPY apps/client/skills/   /app/deploy/skills/

# ──────────────────────────────────────────────────────────────
# Stage 2 — runner
# Lean image with only what is needed at runtime.
# ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

# Create directories that the app writes to at runtime
RUN mkdir -p logs memory temp

# Copy the self-contained app from the builder stage
COPY --from=builder /app/deploy ./

# Expose the web server port (default 3000, overridable via PORT env var)
EXPOSE 3000

CMD ["node", "dist/src/app.js"]
