# PopClip + Raycast UI verification — P0-4

**Date:** 2026-06-15
**Criterion:** `LAUNCH_CRITERIA.md` P0-4
**Proof level:** A (launcher UI) + B (script contract — see [core-path log](./2026-06-14-core-path.md))

Level B script proof exists from 2026-06-14. This log is the **operator checklist**
for Level A confirmation after thin-shim dispatchers (Raycast/PopClip call
`polycast run` + JSON store).

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| macOS with PopClip + Raycast installed | |
| `script/setup` in polycast repo | |
| `polycast` on PATH | `ln -sf "$(pwd)/script/polycast" ~/.local/bin/polycast` |
| `~/Code/<repo>` exists for open-repo test | optional |

## Install (isolated or production)

### Isolated (recommended first pass)

```sh
./script/dogfood-level-a --install --check-b   # sets env, build, apply, Level B spot checks
# or manually:
export POLYCAST_RAYCAST_DIR=/tmp/polycast-ui/raycast
export POLYCAST_POPCLIP_EXTENSIONS=/tmp/polycast-ui/popclip
export POLYCAST_COMMANDS_DIR=/tmp/polycast-ui/commands
mkdir -p "$POLYCAST_RAYCAST_DIR" "$POLYCAST_POPCLIP_EXTENSIONS" "$POLYCAST_COMMANDS_DIR"

cd /path/to/polycast
bun run dev build --target popclip,raycast-script
bun run dev apply --write --target popclip,raycast-script
```

### Production dotfiles

Set `POLYCAST_RAYCAST_DIR` to your enabled Raycast script commands folder and
`POLYCAST_POPCLIP_EXTENSIONS` to PopClip's extensions directory, then
`apply --write` as above.

## Level B spot-check (before UI)

```sh
echo hello | "$POLYCAST_POPCLIP_EXTENSIONS/uppercase.popclipext/script.sh"
# expect: HELLO

"$POLYCAST_RAYCAST_DIR/open-repo.sh" polycast
# expect: exit 0; Finder opens ~/Code/polycast if present
```

| Check | Result | Notes |
|-------|--------|-------|
| PopClip script.sh uppercase | ☑ PASS | 2026-06-15 isolated install — stdout `HELLO` |
| Raycast open-repo.sh | ☑ PASS | 2026-06-15 isolated install — exit 0 |

## Level A — PopClip UI

1. Open PopClip → Extensions (or double-click `uppercase.popclipext` to install from isolated path).
2. Select text in any app (e.g. `hello` in Notes).
3. Invoke PopClip → choose **Uppercase**.
4. Paste — selection should be `HELLO`.

| Step | Result | Screenshot |
|------|--------|------------|
| Extension visible in PopClip | ☐ PASS ☐ FAIL | |
| Uppercase action runs | ☐ PASS ☐ FAIL | |
| Output is uppercase | ☐ PASS ☐ FAIL | |

## Level A — Raycast UI

1. Raycast → Settings → Extensions → Scripts → add `POLYCAST_RAYCAST_DIR` (or symlink scripts into an existing enabled folder).
2. Run **Open Code Repo** from Raycast.
3. Enter folder name `polycast` (or any subfolder of `~/Code`).
4. Confirm Finder opens the target path.

| Step | Result | Screenshot |
|------|--------|------------|
| Script command listed | ☐ PASS ☐ FAIL | |
| Argument prompt appears | ☐ PASS ☐ FAIL | |
| Finder opens correct folder | ☐ PASS ☐ FAIL | |

## Thin-shim JSON edit (optional B+)

After apply, edit JSON without re-installing stubs:

```sh
# Confirm commands store synced
ls "$POLYCAST_COMMANDS_DIR/uppercase.json"

# Edit body.source in uppercase.json, then:
echo hello | "$POLYCAST_POPCLIP_EXTENSIONS/uppercase.popclipext/script.sh"
# expect: new behavior without re-apply of popclip bundle
```

| Check | Result |
|-------|--------|
| JSON store present after apply | ☑ PASS | CI `test/operator-apply.test.ts` P0-4 B+ |
| Body edit reflected at runtime | ☑ PASS | CI PopClip + Raycast thin-shim JSON edit |

## Conclusion

| Proof | Status |
|-------|--------|
| B — script execution | validated — [2026-06-14-core-path.md](./2026-06-14-core-path.md) + operator re-run above |
| B+ — thin-shim JSON edit | validated — CI `test/operator-apply.test.ts` (P0-4 B+) |
| A — PopClip UI | ☐ pending operator sign-off |
| A — Raycast UI | ☐ pending operator sign-off |

When all Level A rows pass, attach screenshots here and update `LAUNCH_CRITERIA.md`
P0-4 status to **validated**.

## References

- [First-command guide](../guides/first-command.md)
- [Operator apply (Dropzone/agent-cli)](./2026-06-15-operator-apply.md)
