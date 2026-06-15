# Level A dogfood — combined operator session

**Task:** `td-ff727f` · **Epic:** `td-f6116a`
**Criteria:** `LAUNCH_CRITERIA.md` P0-4 (PopClip + Raycast) and P1-5 (Shortcuts)

Level B/B+ proof is CI-covered. This doc is the **single session** to finish Level A
UI sign-off and close the launch gate.

## One-shot setup

```sh
cd /path/to/polycast
script/setup
./script/dogfood-level-a --install --check-b --open
```

`--open` launches PopClip to import `uppercase.popclipext` (Setapp or direct install).

For Shortcuts `.shortcut` import (needs [Cherri](https://cherrilang.org/) on PATH):

```sh
./script/dogfood-level-a --install --with-cherri
```

Default install uses isolated dirs under `/tmp/polycast-dogfood` (override with
`POLYCAST_DOGFOOD_DIR`).

## Prerequisites

| App | Required for |
|-----|----------------|
| PopClip | P0-4 PopClip rows |
| Raycast | P0-4 Raycast rows |
| Shortcuts.app | P1-5 rows |
| Cherri | `.shortcut` compile (optional; `.cherri` emit always works) |

Install PopClip from [popclip.app](https://www.popclip.app/) or Setapp
(`/Applications/Setapp/PopClip.app`). The dogfood script detects both paths.

## Level A checklist

### PopClip (P0-4)

1. Open PopClip → Extensions, or double-click
   `$POLYCAST_POPCLIP_EXTENSIONS/uppercase.popclipext`.
2. Select text `hello` in any app → PopClip → **Uppercase** → paste → `HELLO`.
3. Tick rows + screenshot in [popclip-raycast-ui.md](./2026-06-15-popclip-raycast-ui.md).

### Raycast (P0-4)

1. Raycast → Settings → Extensions → Scripts → add `$POLYCAST_RAYCAST_DIR`.
2. Run **Open Code Repo** → enter `polycast` (or any `~/Code` subfolder).
3. Confirm Finder opens the folder.
4. Tick rows + screenshot in [popclip-raycast-ui.md](./2026-06-15-popclip-raycast-ui.md).

### Shortcuts (P1-5)

1. Import `uppercase.shortcut` and `open-repo.shortcut` (via apply `open` or Cherri).
2. Run Uppercase with text `hello` → `HELLO`.
3. Run Open Code Repo with a folder name.
4. Edit `~/.polycast/commands/uppercase.json` body; re-run without re-import.
5. Tick rows + screenshot in [shortcuts-ui.md](./2026-06-15-shortcuts-ui.md).

## When done

1. Attach screenshots to the verification logs linked above.
2. Update `LAUNCH_CRITERIA.md` P0-4 status to **validated**.
3. Close `td-ff727f` and epic `td-f6116a`.

## References

- [Verification index](./README.md)
- [PopClip + Raycast detail](./2026-06-15-popclip-raycast-ui.md)
- [Shortcuts detail](./2026-06-15-shortcuts-ui.md)
- [First-command guide](../guides/first-command.md)
