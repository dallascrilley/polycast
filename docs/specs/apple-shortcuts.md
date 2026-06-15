# Apple Shortcuts (via Cherri)

**Fetched:** 2026-06-14
**Source:** [Cherri language](https://cherrilang.org/language/), [cherri-language hub skill](~/.hub/artifacts/skills/cherri-language), `shortcuts(1)`, Apple Support CLI guide

## polycast approach

Emit `.cherri` source; `polycast build` runs `cherri <file>` when `cherri` is on PATH (skip when `POLYCAST_SKIP_CHERRI=1` or binary missing).

```bash
brew tap electrikmilk/cherri && brew install electrikmilk/cherri/cherri
cherri file.cherri              # → signed .shortcut on macOS
cherri file.cherri --open       # import into Shortcuts.app
```

## Text modality template

```cherri
#define name "My Shortcut"
#define inputs text
#include 'actions/mac'
runShellScript('body here', ShortcutInput, '/bin/bash')
```

Optional: `#define from sharesheet`, `#define glyph`, `#define color` from `x.shortcuts` hints.

## Args modality template

Runtime prompts (not import `#question` — those are setup-time only):

```cherri
#define name "Open Code Repo"
#include 'actions/mac'
@polycast_arg_1 = prompt("repo name", "Text", "")
runShellScript('set -euo pipefail
set -- "{@polycast_arg_1}"
open "$HOME/Code/$1"', nil, '/bin/bash')
```

`dropdown` args skip Shortcuts (Raycast-only); plain `text`/`password` args supported.

## Native `shortcuts` CLI (runtime, not authoring)

- `shortcuts run "Name" -i path -o path`
- `shortcuts list`, `shortcuts view`, `shortcuts sign`
- **No create/import subcommand** — import requires Shortcuts.app confirmation (`open file.shortcut` or `cherri --open`).

## I/O contract (polycast)

| Modality | Support |
|----------|---------|
| `text` | yes (Cherri + ShortcutInput) |
| `none` | yes (no `#define inputs`) |
| `args` | yes — runtime `prompt()` per arg, then `set --` + body `$1..$n` |
| `files` | skip |

## Output layout

- `build/shortcuts-cherri/<id>.cherri`
- `build/shortcuts-cherri/<id>.shortcut` (when compile succeeds)

## Apply

`open` the signed `.shortcut` or run `cherri --open` — user must confirm import in Shortcuts.app.
