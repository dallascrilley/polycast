#!/usr/bin/env bash
#
# Language profile: Node.js / TypeScript (bun).
# Sourced by script/lib/common.sh. Define each run_* command here; the universal
# script/* entrypoints call them. This is the ONLY file that varies by language.
#
# bun is the package manager and script runner (BASE.md tooling standard); apps
# still build and deploy on mise-pinned Node unless the repo opts into bun as
# production runtime. Lockfile is law: if a repo's lockfile says pnpm/npm, edit
# these lines to match — never switch a repo's package manager as a side effect.

run_bootstrap() {
  command -v bun >/dev/null 2>&1 || die "bun not found — install via mise (mise use -g bun@latest), or edit script/lib/profile.sh"
}

run_setup()  { run_bootstrap; bun install; }
run_update() { bun install; }
run_server() { bun run dev; }
run_test()   { POLYCAST_SKIP_CHERRI=1 bun test "$@"; }

run_cibuild() {
  bun install --frozen-lockfile  # lockfile is law — for an npm repo: npm ci --no-audit --no-fund
  bun run lint
  bun run typecheck
  bun test
  bun run build
  POLYCAST_SKIP_CHERRI=1 bun run dev build --strict
  bun run dev runner build
}

run_console() { node; }
