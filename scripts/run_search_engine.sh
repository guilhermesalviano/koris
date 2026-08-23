#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SEARXNG_DIR="${PROJECT_DIR}/searxng"
CONFIG_DIR="${PROJECT_DIR}/config"
SEARXNG_CONFIG="${SEARXNG_DIR}/config/settings.yml"
SETTINGS_EXAMPLE="${SEARXNG_DIR}/settings.example.yml"
SETTINGS_FILE="${CONFIG_DIR}/settings.yml"
COMPOSE_FILE="${SEARXNG_DIR}/docker-compose.yml"

# Ensure config directory exists
mkdir -p "${CONFIG_DIR}"

# Determine source settings file: prefer searxng/config/settings.yml, fall back to settings.example.yml
if [ -f "${SEARXNG_CONFIG}" ]; then
  if [ ! -f "${SETTINGS_FILE}" ]; then
    cp "${SEARXNG_CONFIG}" "${SETTINGS_FILE}"
    echo "Copied ${SEARXNG_CONFIG} -> ${SETTINGS_FILE}"
  fi
  SOURCE_SETTINGS="${SEARXNG_CONFIG}"
elif [ -f "${SETTINGS_EXAMPLE}" ]; then
  if [ ! -f "${SETTINGS_FILE}" ]; then
    cp "${SETTINGS_EXAMPLE}" "${SETTINGS_FILE}"
    echo "Copied ${SETTINGS_EXAMPLE} -> ${SETTINGS_FILE}"
  fi
  SOURCE_SETTINGS="${SETTINGS_EXAMPLE}"
else
  SOURCE_SETTINGS=""
fi

# Generate secret_key if placeholder exists
if grep -q 'REPLACE_WITH_OUTPUT' "${SETTINGS_FILE}" 2>/dev/null; then
  SECRET_KEY=$(openssl rand -hex 32)
  sed -i 's/secret_key: "REPLACE_WITH_OUTPUT.*"/secret_key: "'"${SECRET_KEY}"'"/' "${SETTINGS_FILE}" 2>/dev/null || \
    sed -i 's/^  secret_key: "REPLACE_WITH_OUTPUT.*"/  secret_key: "'"${SECRET_KEY}"'"/' "${SETTINGS_FILE}"
  echo "Generated secret_key in ${SETTINGS_FILE}"
elif [ "$SOURCE_SETTINGS" != "" ] && [ ! -f "${SETTINGS_FILE}" ]; then
  # If we just copied from a source that has a placeholder, also handle it
  SECRET_KEY=$(openssl rand -hex 32)
  sed -i 's/secret_key: "REPLACE_WITH_OUTPUT.*"/secret_key: "'"${SECRET_KEY}"'"/' "${SETTINGS_FILE}" 2>/dev/null || \
    sed -i 's/^  secret_key: "REPLACE_WITH_OUTPUT.*"/  secret_key: "'"${SECRET_KEY}"'"/' "${SETTINGS_FILE}"
  echo "Generated secret_key in ${SETTINGS_FILE}"
fi

# Check if SearXNG is already running
if docker compose -f "${COMPOSE_FILE}" ps --services --filter "status=running" | grep -q "^searxng$"; then
  echo "SearXNG is already running."
  echo "API URL: http://localhost:8080"
  exit 0
fi

# Start SearXNG container
echo "Starting SearXNG container..."
docker compose -f "${COMPOSE_FILE}" up -d

# Wait for SearXNG to be ready
echo "Waiting for SearXNG to be ready..."
MAX_WAIT=60
ELAPSED=0

while [ ${ELAPSED} -lt ${MAX_WAIT} ]; do
  if curl -sf "http://localhost:8080/search?format=json&q=test" > /dev/null 2>&1; then
    echo "SearXNG is ready!"
    echo "API URL: http://localhost:8080"
    exit 0
  fi
  ELAPSED=$((ELAPSED + 1))
  sleep 1
done

echo "Warning: SearXNG did not become ready within ${MAX_WAIT}s, but container may still be starting."
echo "API URL: http://localhost:8080"
exit 1