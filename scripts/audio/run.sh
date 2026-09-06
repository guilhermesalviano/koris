#!/usr/bin/env bash
#
# run.sh - Run sherpa-onnx STT audio sidecar
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PYTHON="${SCRIPT_DIR}/.venv/bin/python"

if [ ! -f "$VENV_PYTHON" ]; then
  echo "Error: Virtual environment not found at ${SCRIPT_DIR}/.venv" >&2
  echo "Please run setup first:" >&2
  echo "  bash ${SCRIPT_DIR}/setup.sh" >&2
  exit 1
fi

cd "$SCRIPT_DIR"
exec "$VENV_PYTHON" server.py "$@"
