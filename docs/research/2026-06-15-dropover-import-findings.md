# F1 — Dropover programmatic import research

**Date:** 2026-06-15
**Task:** `td-88eb8d`
**Environment:** Dropover 5.2.0 (`LastSeenWhatsNewVersion`), macOS 26.4, bundle `me.damir.dropover-mac`

## Question

Can polycast programmatically register Custom Scripts in Dropover (merge into app storage), or must we keep staging + manual import?

## Method

1. Filesystem scan of app sandbox + group container
2. `plutil` / `defaults read` on Dropover preferences
3. Review of `.item_store_instant-actions` (known instant-action ID list)
4. Hub skill `dropover-actions` + polycast spec baseline
5. Public web search (no documented import API found)

## Findings

### App sandbox (`~/Library/Containers/me.damir.dropover-mac/Data`)

| Path | Contents |
|------|----------|
| `Library/Preferences/me.damir.dropover-mac.plist` | UI prefs, keyboard shortcuts, recent built-in action IDs — **no custom script source** |
| `Library/Application Support/.item_store_instant-actions` | JSON array of **built-in** instant-action identifiers only, e.g. `dropoverLink`, `operationImageResize` |
| `Documents/.operation_configuration_properties/*` | Image operation presets (global config blobs) |
| `Documents/.instance-*` | Subscription / cloud instance metadata |
| `Documents/.polycast-scripts/` | **polycast staging only** (not read by Dropover automatically) |

Only **22 files** total in sandbox on this machine — minimal footprint.

### Group container (`~/Library/Group Containers/D3Y7QS482H.group.me.damir.dropover-mac`)

| Path | Contents |
|------|----------|
| `.drag_sessions` | Drag session state |
| `.files-snapshot-default/*` | Shelf file snapshots (UUID-named blobs) |

No script definitions, plists, or `.sh` payloads.

### Custom Scripts on this machine

**Zero user-defined Custom Scripts** configured. Dropover KB and hub skill confirm creation is **UI-only** (Settings → Custom Scripts → Add New). No export/import menu documented.

### Prior art (2026-06-14)

Initial inspection reached the same conclusion with fewer paths checked. This pass adds **group container** coverage and confirms instant-action store holds IDs only, not script bodies.

## Verdict

**Storage is opaque for programmatic import.**

Custom Script definitions (name, type, source text, icon) appear to live in Dropover-internal storage (likely `NSKeyedArchiver` / Core Data inside the sandbox) that is **not exposed as stable plain files** without reverse-engineering the binary format.

**polycast must not** `defaults write` or patch `.item_store_instant-actions` — would risk corrupting Dropover config and mixing with built-in actions.

## Safe merge strategy (locked)

| Rule | Rationale |
|------|-----------|
| Stage scripts under `Documents/.polycast-scripts/` (`POLYCAST_DROPOVER_SCRIPTS`) | Outside Dropover's internal stores; polycast-owned paths only |
| Write `.polycast-owned` beside each staged script | Enables `apply --prune` without touching foreign files |
| Ship `manifest.json` catalog from emitter | Operator checklist; future automation hook |
| `apply` prints manifest-driven import note | See `src/dropover-manifest.ts` |
| Never mutate `me.damir.dropover-mac.plist` or `.item_store_instant-actions` | Avoid breaking Instant Actions / prefs |
| Emitter output unchanged until official API exists | Apply adapter only extends when schema documented |

## Operator re-scan playbook (when Custom Scripts exist)

If Dropover adds scripts or a future install has user-defined scripts:

```bash
# After adding a test Custom Script in Dropover UI, re-run:
CONTAINER=~/Library/Containers/me.damir.dropover-mac/Data
GROUP=~/Library/Group\ Containers/D3Y7QS482H.group.me.damir.dropover-mac
find "$CONTAINER" "$GROUP" -type f -newer /tmp/dropover-scan-marker 2>/dev/null
plutil -p "$CONTAINER/Library/Preferences/me.damir.dropover-mac.plist" | rg -i script
strings "$CONTAINER/Library/Preferences/me.damir.dropover-mac.plist" | rg -i '\.sh|bash|custom'
```

Compare before/after mtimes. If a new keyed archive or JSON file appears with script source, document path in this file and revisit apply adapter.

## Future triggers to reopen

- Dropover documents Custom Script import/export or a URL scheme
- Re-scan finds stable on-disk script records after UI creation
- Dropover exposes Shortcuts / AppleScript dictionary for script registration

## References

- [docs/specs/dropover-custom-scripts.md](../specs/dropover-custom-scripts.md)
- [docs/research/2026-06-14-destination-emitters-findings.md](./2026-06-14-destination-emitters-findings.md)
- Hub skill: `dropover-actions`
