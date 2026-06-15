# Shortcuts operator verification

**Date:** 2026-06-15
**Task:** td-82c232
**Criterion:** `LAUNCH_CRITERIA.md` P1-5 (thin-shim) + Level A UI
**Proof level:** B (CI + script) + A (Shortcuts.app — manual)

> **Combined session:** [level-a-dogfood.md](./level-a-dogfood.md) · `./script/dogfood-level-a`

Shortcuts emit `.cherri` → `cherri` compiles → signed `.shortcut` → one-time import.
After thin-shim upgrade, **re-import once**; body edits live in `~/.polycast/commands/`.

## Automated (CI)

| Test | Proof |
|------|-------|
| `test/shim.test.ts` | Cherri shell stubs delegate to `polycast run` |
| `test/run.test.ts` | Text shim + JSON store edit without stub change |
| `test/emitters.test.ts` | `.cherri` output has dispatcher, not inline body |
| `test/operator-apply.test.ts` | (Dropzone/agent-cli pattern; shortcuts apply opens `.shortcut`) |
| `test/operator-apply.test.ts` P1-5 B+ | apply syncs commands store; text shim + JSON edit |

```sh
bun test test/shim.test.ts test/run.test.ts
```

Last verified: 2026-06-15 (CI)

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| macOS + Shortcuts.app | |
| [Cherri](https://cherrilang.org/) on PATH | `brew tap electrikmilk/cherri && brew install electrikmilk/cherri/cherri` |
| Dropover N/A | |
| `polycast` on PATH | `script/polycast` — **required inside Shortcuts sandbox** |

Set absolute path when importing:

```sh
export POLYCAST_BIN="$(pwd)/script/polycast"
```

## Build + apply

```sh
./script/dogfood-level-a --install --with-cherri   # isolated dirs + Shortcuts .shortcut when cherri on PATH
# or manually:
cd /path/to/polycast
export POLYCAST_COMMANDS_DIR=~/.polycast/commands   # or isolated temp dir

bun run dev build --target shortcuts-cherri
bun run dev apply --write --target shortcuts-cherri
# opens .shortcut files — confirm import in Shortcuts.app
```

Apply also syncs `commands/*.json` to `POLYCAST_COMMANDS_DIR`.

**Note from apply:** re-import `.shortcut` once after thin-shim upgrade.

## Level B — without Shortcuts UI

Simulate the compiled shell stub (same as CI):

```sh
export POLYCAST_BIN="$(pwd)/script/polycast"
export POLYCAST_COMMANDS_DIR=/tmp/polycast-sc/commands
mkdir -p "$POLYCAST_COMMANDS_DIR"
bun run dev apply --write --target shortcuts-cherri --out ./build \
  POLYCAST_COMMANDS_DIR="$POLYCAST_COMMANDS_DIR" 2>/dev/null || true
# Or copy from ~/.polycast/commands after apply

# Run text shim logic directly (see test/run.test.ts)
```

| Check | Result |
|-------|--------|
| `.cherri` contains `run --commands` not inline `tr` | ☑ PASS — emitter tests |
| JSON edit changes runtime | ☑ PASS — `test/run.test.ts` |

## Level A — Shortcuts UI (manual)

### Text — Uppercase

1. Import `build/shortcuts-cherri/uppercase.shortcut` (via apply `open` or `cherri uppercase.cherri --open`).
2. Share sheet or run from Shortcuts with input text `hello`.
3. Output should be `HELLO`.

### Args — Open Code Repo

1. Import `open-repo.shortcut`.
2. Run shortcut; enter folder name when prompted.
3. Confirm expected action (opens `~/Code/<folder>` when path exists).

| Step | Result | Screenshot |
|------|--------|------------|
| Uppercase shortcut imported | ☐ PASS ☐ FAIL | |
| Text input → uppercase output | ☐ PASS ☐ FAIL | |
| Open-repo prompt + arg works | ☐ PASS ☐ FAIL | |
| Edit `uppercase.json` body — no re-import | ☐ PASS ☐ FAIL | |

### JSON edit without re-import

1. After import, edit `~/.polycast/commands/uppercase.json` `body.source`.
2. Re-run Uppercase shortcut with same input.
3. Behavior should match new body (stub unchanged).

## Conclusion

| Proof | Status |
|-------|--------|
| B — thin-shim + JSON store | validated — P1-5 tests |
| B+ — apply syncs store + shim JSON edit | validated — CI `test/operator-apply.test.ts` (P1-5 B+) |
| A — Shortcuts.app UI | ☐ pending operator sign-off |

## References

- [Apple Shortcuts spec](../specs/apple-shortcuts.md)
- [Thin-shim plan](../plans/2026-06-15-feat-shortcuts-cherri-thin-shim-plan.md)
- [First-command guide](../guides/first-command.md)
