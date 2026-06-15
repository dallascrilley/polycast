# Dropover operator verification

**Date:** 2026-06-15
**Task:** td-9ef6bd
**Proof level:** B (script + apply staging) + A (Dropover UI — manual)

Dropover has **no programmatic import API** — polycast stages scripts + manifest;
operator registers them in Dropover Pro → Settings → Custom Scripts.
See [research note](../research/2026-06-15-dropover-import-findings.md).

## Automated (CI)

`test/operator-apply.test.ts` — **dropover apply** case:

- `apply --write` stages `basename-files.sh` + `manifest.json`
- Script dispatcher calls `polycast run`; JSON store edits change behavior without re-apply

```sh
bun test test/operator-apply.test.ts -t dropover
```

Last verified: 2026-06-15 (CI)

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Dropover **Pro** installed | Custom Scripts feature |
| `script/setup` in polycast repo | |
| `polycast` on PATH | `script/polycast` symlink |

## Install (isolated spot-check)

```sh
export POLYCAST_DROPOVER_SCRIPTS=/tmp/polycast-dropover/staging
export POLYCAST_COMMANDS_DIR=/tmp/polycast-dropover/commands
export POLYCAST_BIN="$(pwd)/script/polycast"
mkdir -p "$POLYCAST_DROPOVER_SCRIPTS" "$POLYCAST_COMMANDS_DIR"

cd /path/to/polycast
bun run dev build --target dropover-script
bun run dev apply --write --target dropover-script
```

Expected apply output includes a **note** with import steps and paths under staging.

## Level B — script execution

```sh
SAMPLE=/tmp/polycast-dropover-sample.txt
echo x > "$SAMPLE"
bash "$POLYCAST_DROPOVER_SCRIPTS/basename-files.sh" "$SAMPLE"
# expect stdout: polycast-dropover-sample.txt (basename only)
```

| Check | Result | Notes |
|-------|--------|-------|
| `manifest.json` present | ☑ PASS | 2026-06-15 isolated apply |
| `basename-files.sh` executable | ☑ PASS | thin-shim dispatcher |
| Script prints basename | ☑ PASS | Level B spot-check |
| `commands-store` synced | ☑ PASS | `basename-files.json` after apply |

### Thin-shim JSON edit

```sh
# Edit body.source in $POLYCAST_COMMANDS_DIR/basename-files.json, then re-run script
bash "$POLYCAST_DROPOVER_SCRIPTS/basename-files.sh" "$SAMPLE"
# expect: updated behavior without re-apply of .sh stub
```

| Check | Result |
|-------|--------|
| JSON edit reflected at runtime | ☐ PASS ☐ FAIL |

## Level A — Dropover UI (manual)

Dropover does **not** auto-read `.polycast-scripts/`. Register each script once:

1. Open **Dropover → Settings → Custom Scripts → Add New → Shell**.
2. Name: **Basename Files** (match `manifest.json`).
3. Script path: `$POLYCAST_DROPOVER_SCRIPTS/basename-files.sh` (or paste body from staged file).
4. Save.
5. Drag a file onto the shelf → run **Basename Files**.
6. Confirm output matches basename expectation.

Optional — **Instant Actions** (max 6 slots): assign in Settings → Instant Actions.
Manifest `instantAction: true` is a hint only; assignment is manual.

| Step | Result | Screenshot |
|------|--------|------------|
| Custom Script registered | ☐ PASS ☐ FAIL | |
| Drag + run produces basename | ☐ PASS ☐ FAIL | |
| JSON body edit without re-import | ☐ PASS ☐ FAIL | |

## Safe merge rules

polycast **never** edits:

- `me.damir.dropover-mac.plist`
- `.item_store_instant-actions`

Only copies into `.polycast-scripts/` with `.polycast-owned` markers.

## Conclusion

| Proof | Status |
|-------|--------|
| B — apply staging + script | validated — CI + 2026-06-15 isolated run |
| A — Dropover UI | ☐ pending operator sign-off |

## References

- [Dropover spec](../specs/dropover-custom-scripts.md)
- [PopClip/Raycast UI checklist](./2026-06-15-popclip-raycast-ui.md) (same Level A/B pattern)
- [Dropzone operator apply](./2026-06-15-operator-apply.md)
