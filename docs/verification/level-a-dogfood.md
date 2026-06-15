# Level A dogfood — combined operator session

**Task:** `td-ff727f` (P0-4 — **closed**) · **Epic:** `td-f6116a` (Shortcuts P1-5 A still open)
**Criteria:** `LAUNCH_CRITERIA.md` P0-4 validated; P1-5 Shortcuts Level A optional follow-up

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

### PopClip (P0-4) — ☑ done (2026-06-15)

1. ~~Open PopClip → Extensions~~ — `dogfood-level-a --open` (Setapp path).
2. ~~Select text `hello` → **Uppercase** → paste `HELLO`.~~ Operator confirmed.
3. Detail log: [popclip-raycast-ui.md](./2026-06-15-popclip-raycast-ui.md).

### Raycast (P0-4) — ☑ done (2026-06-15)

1. Raycast → Settings → Extensions → Scripts → add `$POLYCAST_RAYCAST_DIR`
   (`/tmp/polycast-dogfood/raycast` for isolated dogfood).
2. **Open Code Repo** lists once folder is enabled — operator sign-off with B proof
   (`open-repo.sh polycast` exit 0).
3. Detail log: [popclip-raycast-ui.md](./2026-06-15-popclip-raycast-ui.md).

### Shortcuts (P1-5) — pending

1. Import `uppercase.shortcut` and `open-repo.shortcut` (via apply `open` or Cherri).
2. Run Uppercase with text `hello` → `HELLO`.
3. Run Open Code Repo with a folder name.
4. Edit `~/.polycast/commands/uppercase.json` body; re-run without re-import.
5. Tick rows + screenshot in [shortcuts-ui.md](./2026-06-15-shortcuts-ui.md).

## When P0-4 is done

1. ~~PopClip + Raycast Level A~~ — validated 2026-06-15.
2. ~~`LAUNCH_CRITERIA.md` P0-4~~ — validated.

## When P1-5 Shortcuts is done

1. Tick Shortcuts rows in [shortcuts-ui.md](./2026-06-15-shortcuts-ui.md).
2. Close epic `td-f6116a` if no other polish remains.

## References

- [Verification index](./README.md)
- [PopClip + Raycast detail](./2026-06-15-popclip-raycast-ui.md)
- [Shortcuts detail](./2026-06-15-shortcuts-ui.md)
- [First-command guide](../guides/first-command.md)
