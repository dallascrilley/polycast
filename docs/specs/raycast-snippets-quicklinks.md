# Raycast snippets and quicklinks

**Fetched:** 2026-06-14
**Source:** Operator samples in `~/.dotfiles/raycast/shell-functions-snippets.json`, `~/.dotfiles/raycast/quicklinks/quicklinks-import.json`

## Snippets

JSON array of objects:

```json
{ "name": "mkcd - Create directory and cd into it", "text": "mkcd ", "keyword": "mkcd" }
```

Static text expansion only — no script execution. Maps to `x.raycast.snippet.text` (+ optional `keyword`) on `CommandDef`.

## Quicklinks

JSON array:

```json
{ "name": "Open Code Subfolder", "link": "~/Code/{argument name=\"folder-name\"}", "openWith": "Finder" }
```

Maps to `x.raycast.quicklink.link` and optional `openWith`. Argument templates use Raycast `{argument name="..."}` syntax when modality is `args`.

## polycast output

One catalog file per build:

- `build/raycast-snippet/snippets.json`
- `build/raycast-quicklink/quicklinks.json`

Import via Raycast UI or dotfiles import scripts.

## I/O contract

| Modality | Snippet | Quicklink |
|----------|---------|-----------|
| `none` + hints | yes | yes |
| `args` + quicklink hint | skip | yes (templated link) |
| body-only without hints | skip | skip |
