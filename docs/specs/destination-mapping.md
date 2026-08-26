# Destination mapping (IR → platform)

**Last reviewed:** 2026-08-26
**IR:** [`src/types.ts`](../../src/types.ts) `CommandDef` + `Modality` + `x.*`

## Core field mapping

| IR field | raycast-script | popclip | dropzone | dropover | shortcuts-cherri | agent-cli |
|----------|----------------|---------|----------|----------|------------------|-----------|
| `id` | filename `<id>.sh` | `com.polycast.<id>` | bundle `<id>.dzbundle` | `<id>.sh` | `<id>.cherri` | `<id>` binary |
| `title` | `@raycast.title` | `name` | `# Name:` | manifest `name` | `#define name` | `--help` header |
| `description` | `@raycast.description` | `description` | `# Description:` | manifest | (comment) | `--help` |
| `icon` | `@raycast.icon` | `icon` | (icon.png future) | — | `#define glyph` via hint | — |
| `author` | `@raycast.author` | — | `# Creator:` | — | — | meta JSON |
| `modality` | skip matrix | skip matrix | skip matrix | skip matrix | skip matrix | skip matrix |
| `args` | `@raycast.argumentN` | — | — | — | v1 skip | positional |
| `body.source` | `polycast run` stub | `script.sh` → `polycast run --text` | `run.sh` → `polycast run` | `<id>.sh` → `polycast run` | `runShellScript` → `polycast run` | `polycast run` stub |

## Static Raycast surfaces

| Hint | Output |
|------|--------|
| `x.raycast.snippet.text` | row in `build/raycast-snippet/snippets.json` |
| `x.raycast.quicklink.link` | row in `build/raycast-quicklink/quicklinks.json` |

## Build output tree

```
build/
  commands/<id>.json              # shared JSON body store
  raycast-script/<id>.sh
  popclip/<id>.popclipext/
  dropzone/<id>.dzbundle/
  dropover-script/<id>.sh
  dropover-script/manifest.json
  shortcuts-cherri/<id>.cherri
  shortcuts-cherri/<id>.shortcut   # when cherri compile runs
  raycast-snippet/snippets.json
  raycast-quicklink/quicklinks.json
  agent-cli/<id>
  agent-cli/<id>.polycast-meta.json
```

Persistent installs receive ownership markers on `apply`. File artifacts use a
sidecar named `<artifact>.polycast-owned`. PopClip and Dropzone bundles use one
`.polycast-owned` file inside the bundle directory. The JSON body store uses a
sidecar for each `commands/<id>.json` file. Shortcuts and Raycast catalog files
are imported or handled manually, so they are not persistent directory installs.

## Apply install map

| Target | Default install path | Reload |
|--------|---------------------|--------|
| raycast-script | `POLYCAST_RAYCAST_DIR` or `~/.polycast/raycast` | Register the directory in Raycast, then let Raycast rescan it |
| popclip | `~/Library/Application Support/PopClip/Extensions/` | double-click or copy bundle |
| dropzone | `POLYCAST_DROPZONE_ACTIONS` (DZ4/DZ5 paths) | Dropzone rescans Actions |
| dropover-script | container `Documents/.polycast-scripts/` + manifest | manual Settings import |
| shortcuts-cherri | `open` `.shortcut` | Shortcuts.app import dialog |
| agent-cli | `POLYCAST_AGENT_BIN` default `~/.agents/tools/` | PATH |

## Cherri post-build

After writing `.cherri` files, `polycast build` runs Cherri only when both
conditions hold:

- `POLYCAST_SKIP_CHERRI` is not exactly `1`. Unset and other values do not skip
  the compile.
- `cherri` is on PATH.

The compiler writes `<id>.shortcut` beside the `.cherri` source. `apply
--write` opens each compiled file for import in Shortcuts.app. `apply --prune`
does not remove the imported shortcut or the compiled file under `build/`.

## Shared body store and pruning

Dispatcher targets read their body from
`POLYCAST_COMMANDS_DIR`, which defaults to `~/.polycast/commands` on apply.
`apply --write` copies `build/commands/<id>.json` there, so editing the body
requires a new build and apply but does not require a new launcher-specific
wrapper.

`apply --prune-only` previews removal of marked files. Add `--write` to remove
them. Pruning scans persistent install roots and the shared JSON body store. It
leaves foreign files, imported Shortcuts, and build output alone.

## Dropover manifest schema

```json
{
  "version": 1,
  "scripts": [
    {
      "id": "basename-files",
      "name": "Basename Files",
      "description": "...",
      "scriptPath": "basename-files.sh",
      "polycastOwned": true
    }
  ]
}
```

## Forge boundary

- **polycast:** one `CommandDef` → many launcher artifacts + `apply` sync
- **forge:** single-tool lifecycle (`forge new`, `wrap`, `install --target raycast`, `promote`)
- **Integration:** agent-cli output is forge-wrap compatible; do not duplicate forge Raycast install for polycast-managed commands

See also [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).
