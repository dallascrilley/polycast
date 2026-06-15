# Destination mapping (IR → platform)

**Date:** 2026-06-14
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
| `body.source` | `polycast run` stub | `script.sh` → `polycast run --text` | `run.sh` → `polycast run` | wrapped in loop | `runShellScript` (inline) | `polycast run` stub |

## Static Raycast surfaces

| Hint | Output |
|------|--------|
| `x.raycast.snippet.text` | row in `build/raycast-snippet/snippets.json` |
| `x.raycast.quicklink.link` | row in `build/raycast-quicklink/quicklinks.json` |

## Build output tree

```
build/
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

Each installed artifact includes `.polycast-owned` marker on `apply`.

## Apply install map

| Target | Default install path | Reload |
|--------|---------------------|--------|
| raycast-script | `POLYCAST_RAYCAST_DIR` or `./build/raycast-script` (document only) | Raycast rescans script dirs |
| popclip | `~/Library/Application Support/PopClip/Extensions/` | double-click or copy bundle |
| dropzone | `POLYCAST_DROPZONE_ACTIONS` (DZ4/DZ5 paths) | Dropzone rescans Actions |
| dropover-script | container `Documents/.polycast-scripts/` + manifest | manual Settings import |
| shortcuts-cherri | `open` `.shortcut` | Shortcuts.app import dialog |
| agent-cli | `POLYCAST_AGENT_BIN` default `~/.agents/tools/` | PATH |

## Cherri post-build

After writing `.cherri` files, `polycast build` runs `cherri <path>` when:

- `cherri` on PATH
- `POLYCAST_SKIP_CHERRI` unset

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

See also [`docs/DESIGN.md`](../DESIGN.md).
