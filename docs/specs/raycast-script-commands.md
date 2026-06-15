# Raycast script commands

**Fetched:** 2026-06-14
**Source:** [raycast/script-commands README](https://github.com/raycast/script-commands/blob/master/README.md), [ARGUMENTS.md](https://github.com/raycast/script-commands/blob/master/documentation/ARGUMENTS.md), [OUTPUTMODES.md](https://github.com/raycast/script-commands/blob/master/documentation/OUTPUTMODES.md)

## Packaging

Single executable script file with shebang + `# @raycast.*` comment metadata at top.

Install: add script directory in Raycast Settings → Extensions → Script Commands, or symlink into an indexed folder (e.g. `_enabled/` mirror in dotfiles).

## Required metadata

| Parameter | Value |
|-----------|--------|
| `@raycast.schemaVersion` | `1` (only version) |
| `@raycast.title` | Display name |
| `@raycast.mode` | `silent` \| `compact` \| `fullOutput` \| `inline` |

## Optional metadata

`icon`, `iconDark`, `packageName`, `description`, `author`, `needsConfirmation`, `currentDirectoryPath`, `refreshTime` (inline only, e.g. `10s`, `1m`), `argument1..3` (JSON).

## Arguments

JSON object per `argumentN`:

- `type`: `text` \| `password` \| `dropdown` (required)
- `placeholder`: string (required)
- `optional`: boolean
- `percentEncoded`: boolean
- `data`: `[{title, value}]` when `type` is `dropdown`

Script receives values as `$1`, `$2`, `$3`.

## I/O contract (polycast)

| Modality | Raycast support | Wrapper |
|----------|-----------------|---------|
| `args` | yes | body uses `$1..$n` |
| `none` | yes | body only |
| `text` | skip | — |
| `files` | skip | — |

## Example

See `commands/open-repo.ts` → `build/raycast-script/open-repo.sh`.
