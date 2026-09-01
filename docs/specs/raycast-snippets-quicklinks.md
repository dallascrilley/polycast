# Raycast snippets and quicklinks

**Fetched:** 2026-08-31
**Sources:** [Raycast Snippets manual](https://manual.raycast.com/snippets),
[Raycast Import & Export manual](https://manual.raycast.com/import-export), and
operator exports under `~/.dotfiles/raycast/`

## Snippets

JSON array of objects:

```json
{ "name": "mkcd - Create directory and cd into it", "text": "mkcd ", "keyword": "mkcd" }
```

Static text expansion only — no script execution. Maps to `x.raycast.snippet.text` (+ optional `keyword`) on `CommandDef`.

Current exports may include a `tags` array even though the documented JSON
import shape names only `name`, `text`, and `keyword`. Capture reports tags as
omitted target metadata. It does not silently treat them as portable fields.

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

`polycast capture --from raycast-snippets` runs the reverse path. It reads an
export, filters private or nonportable rows, and creates validated nested
`CommandDef` modules. Capture is a dry run unless `--write` is present. The
source export is never edited or copied into Git.

## I/O contract

| Modality | Snippet | Quicklink |
|----------|---------|-----------|
| `none` + hints | yes | yes |
| `args` + quicklink hint | skip | yes (templated link) |
| body-only without hints | skip | skip |
