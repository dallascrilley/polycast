# Dropover custom scripts

**Fetched:** 2026-06-14 (storage re-validated 2026-06-15 — see [research note](../research/2026-06-15-dropover-import-findings.md))
**Source:** [dropover-actions hub skill](~/.hub/artifacts/skills/dropover-actions), [Dropover KB](https://dropoverapp.com/kb/instant-actions), local container inspection (Dropover 5.2.0, macOS 26.4)

## Scope

**Custom Scripts only** — arbitrary shell/AppleScript/Automator logic. Custom Actions (UI-wrapped built-in operations) are out of scope for polycast emitters.

Requires **Dropover Pro**.

## I/O contract

Shell scripts receive dragged file paths as `"$@"` (same as Dropzone files modality).

```bash
for filepath in "$@"; do
  # process $filepath
done
```

## polycast output

- `build/dropover-script/<id>.sh` (755)
- `build/dropover-script/manifest.json` — catalog for apply/import

## On-disk storage research (2026-06-14)

Dropover is sandboxed. Observed paths on a Dropover 5.2.0 install:

| Path | Contents |
|------|----------|
| `~/Library/Containers/me.damir.dropover-mac/` | App sandbox root |
| `.../Data/Library/Preferences/me.damir.dropover-mac.plist` | User prefs (no custom script payload on test machine) |
| `.../Data/Library/Application Support/.item_store_instant-actions` | JSON array of instant-action identifiers, e.g. `[{"identifier":"dropoverLink"}, ...]` |
| `.../Data/Documents/.instance-*` | Cloud/subscription instance metadata (JSON) |
| `~/Library/Group Containers/D3Y7QS482H.group.me.damir.dropover-mac/` | Drag sessions + shelf file snapshots — **no script definitions** |

**Verdict (confirmed 2026-06-15):** Custom script *source text* is **not exposed as plain files**. Storage is **opaque / UI-managed**. polycast `apply` uses **staging + manifest** (see [F1 research](../research/2026-06-15-dropover-import-findings.md)):

1. Copy polycast-owned scripts to `~/Library/Containers/me.damir.dropover-mac/Data/Documents/.polycast-scripts/<id>.sh`
2. Write `.polycast-owned` marker beside each script
3. Emit `manifest.json` with name, description, script path for manual import or future automation
4. Never mutate non-polycast Dropover preferences

If Dropover adds a documented import API, extend the apply adapter without changing emitter output.

## Instant Actions

Max 6 slots. Optional `x.dropover.instantAction: true` in IR for manifest hint only (assignment remains manual in Settings).

## I/O matrix

| Modality | Support |
|----------|---------|
| `files` | yes |
| others | skip |
