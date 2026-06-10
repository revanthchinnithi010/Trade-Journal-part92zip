#!/bin/bash
# Ensures workspace-root node_modules exist before any artifact dev server starts.
# Safe to call repeatedly — exits immediately if deps are already present.
WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -d "$WORKSPACE_ROOT/node_modules" ]; then
  echo "[ensure-install] node_modules missing — installing workspace dependencies..."
  cd "$WORKSPACE_ROOT"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  echo "[ensure-install] install complete"
fi
