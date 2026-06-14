#!/bin/bash
# Ensures workspace-root node_modules are fully installed before any artifact dev server starts.
# Uses a sentinel file so a broken/partial install is retried on next startup.
WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SENTINEL="$WORKSPACE_ROOT/node_modules/.install-complete"

if [ ! -f "$SENTINEL" ]; then
  echo "[ensure-install] node_modules missing or incomplete — installing workspace dependencies..."
  cd "$WORKSPACE_ROOT"
  pnpm install 2>/dev/null || pnpm install
  touch "$SENTINEL"
  echo "[ensure-install] install complete"
fi
