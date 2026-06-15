# PopClip extensions

**Fetched:** 2026-06-14
**Source:** [popclip.app/dev](https://www.popclip.app/dev/), [packages](https://www.popclip.app/dev/packages), [shell-script-actions](https://www.popclip.app/dev/shell-script-actions)

## Packaging

Directory `<name>.popclipext/` containing:

- `Config.json` (preferred over plist)
- Optional icon, readme, script files

Install: double-click `.popclipext` or copy to `~/Library/Application Support/PopClip/Extensions/`.

## Config.json (required top-level)

- `identifier` — reverse-DNS, e.g. `com.polycast.uppercase`
- `name` — display name
- `actions[]` — at least one action

## Shell script action

Use `shell script file` pointing at a script in the bundle. For stdin-based bodies:

```json
{
  "title": "Uppercase",
  "shell script file": "script.sh",
  "stdin": "text"
}
```

PopClip pipes selected text to stdin when `stdin` is `text` (maps to `POPCLIP_TEXT`).

Script execution: shebang + executable bit, or `interpreter` field.

## Filters

`requirements`, `regex`, `required apps` / `excluded apps` on actions.

## I/O contract (polycast)

| Modality | Support |
|----------|---------|
| `text` | yes (`stdin: text`) |
| others | skip |

## Example

`commands/uppercase.ts` → `build/popclip/uppercase.popclipext/`.
