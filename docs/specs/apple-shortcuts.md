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
runShellScript('set -euo pipefail
POLYCAST="${POLYCAST_BIN:-polycast}"
COMMANDS="${POLYCAST_COMMANDS_DIR:-$HOME/.polycast/commands}"
TEXT="$(cat)"
exec "$POLYCAST" run --commands "$COMMANDS" my-command --text "$TEXT"', ShortcutInput, '/bin/bash')
```

Body lives in `~/.polycast/commands/<id>.json` after `apply --write`. Set
`POLYCAST_BIN` when Shortcuts cannot see your shell PATH (see `script/polycast`).

Optional: `#define from sharesheet`, `#define glyph`, `#define color` from `x.shortcuts` hints.

## Args modality template

Runtime prompts (not import `#question` — those are setup-time only):

```cherri
#define name "Open Code Repo"
#include 'actions/mac'
@polycast_arg_1 = prompt("repo name", "Text", "")
runShellScript('set -euo pipefail
POLYCAST="${POLYCAST_BIN:-polycast}"
COMMANDS="${POLYCAST_COMMANDS_DIR:-$HOME/.polycast/commands}"
set -- "{@polycast_arg_1}"
exec "$POLYCAST" run --commands "$COMMANDS" open-repo "$@"', nil, '/bin/bash')
```

`dropdown` args skip Shortcuts (Raycast-only); plain `text`/`password` args supported.

## Files modality template

Pass Input is `as arguments` so paths stay `"$@"` instead of newline-delimited stdin:

```cherri
#define name File to Inbox
#define from sharesheet
#define inputs file
#include 'actions/mac'
runShellScript('set -euo pipefail
POLYCAST="${POLYCAST_BIN:-polycast}"
COMMANDS="${POLYCAST_COMMANDS_DIR:-$HOME/.polycast/commands}"
exec "$POLYCAST" run --commands "$COMMANDS" file-to-inbox "$@"', ShortcutInput, '/bin/bash', 'as arguments')
```

## Native `shortcuts` CLI (runtime, not authoring)

- `shortcuts run "Name" -i path -o path`
- `shortcuts list`, `shortcuts view`, `shortcuts sign`
- **No create/import subcommand** — import requires Shortcuts.app confirmation (`open file.shortcut` or `cherri --open`).

## I/O contract (polycast)

| Modality | Support |
|----------|---------|
| `text` | yes (Cherri + ShortcutInput) |
| `none` | yes (no `#define inputs`) |
| `args` | yes — runtime `prompt()` per arg, then `polycast run` with `"$@"` |
| `files` | yes — `#define inputs file`, `runShellScript(..., ShortcutInput, '/bin/bash', 'as arguments')` so paths stay argv |

## Output layout

- `build/shortcuts-cherri/<id>.cherri`
- `build/shortcuts-cherri/<id>.shortcut` (when compile succeeds)

## Apply

`open` the signed `.shortcut` or run `cherri --open` — user must confirm import in Shortcuts.app.

After upgrading to thin-shim stubs, **re-import once**; later body edits sync via
`~/.polycast/commands/` without recompile.
