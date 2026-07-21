---
name: tar npm package blocked by Replit firewall
description: The `tar` npm package is blocked by Replit's package firewall across ALL versions. Fix is a local workspace stub.
---

# tar npm package — Replit firewall block

**Rule:** Never try to install `tar` from npm on this Replit. All versions (6.x, 7.x) return `ERR_PNPM_FETCH_403` from `package-firewall.replit.local`. The fix is a local workspace stub.

**Why:** Replit's package firewall blocks `tar` at the network level regardless of version or `minimumReleaseAge`. Root cause unknown but consistent.

**How to apply:**
- `lib/tar-stub/` is a workspace package named `tar` at version `7.5.16`
- `pnpm-workspace.yaml` overrides section has `tar: link:./lib/tar-stub`
- The stub exports the full `tar` API surface as stubs (operations throw if called)
- `@expo/cli` only imports `ReadEntry` as a type at dev startup; the stub satisfies this without errors
- If `tar` operations are genuinely needed at runtime, a real implementation using Node.js streams must be added to `lib/tar-stub/index.js`
