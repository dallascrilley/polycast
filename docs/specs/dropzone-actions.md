# Dropzone actions

**Fetched:** 2026-06-14
**Source:** [aptonic/dropzone4-actions README](https://github.com/aptonic/dropzone4-actions/blob/master/README.md)

## Packaging

`.dzbundle/` folder with `action.rb` (Ruby header comments + Ruby/shell logic) and `icon.png`.

Install paths (configure via `POLYCAST_DROPZONE_ACTIONS` or polycast config):

- Dropzone 4: `~/Library/Application Support/Dropzone/Actions/`
- Dropzone 5: `~/Library/Application Support/Dropzone 5/Actions/`

## Required header fields

| Field | Example |
|-------|---------|
| `# Name:` | Action title |
| `# Description:` | What it does |
| `# Handles:` | `Files` \| `Text` \| `Files, Text` |
| `# Creator:` | Author |
| `# URL:` | Project URL |

## Optional header fields

`Events` (`Dragged`, `Clicked`), `SkipConfig: Yes`, `MinDropzoneVersion`, `RunsSandboxed`, `KeyModifiers`.

## Runtime environment

When dragged: `ENV['items']` (paths), `ENV['dragged_type']` (`files` or `text`), `ENV['support_folder']`.

## I/O contract (polycast)

| Modality | Handles | Wrapper |
|----------|---------|---------|
| `files` | `Files` | pass paths as `"$@"` to embedded shell |
| `text` | `Text` | single text item |
| others | skip | — |

## Example

Files command → `build/dropzone/<id>.dzbundle/action.rb`.
