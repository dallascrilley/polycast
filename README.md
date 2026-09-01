# polycast — one command definition, cast to every macOS launcher

I keep the same small commands in four places. Uppercase the selection, open a
repo, print the basename of whatever I dragged. Raycast wants a shell script
with a comment header, PopClip wants a bundle directory, Dropzone wants Ruby,
Shortcuts wants something else again. I would fix a bug in one and leave the
other three wrong.

polycast reads one definition and writes the per-launcher artifacts. Each
definition declares an I/O modality (`text`, `files`, `args`, or `none`), and an
emitter that cannot represent that modality writes nothing for it instead of
guessing. That is the rule the whole thing rests on, and it lives in the
`supports` field on each emitter in [`src/registry.ts`](src/registry.ts).

## What each surface gets

| Surface | Accepts | Generated artifacts |
|---|---|---|
| `raycast-script` | `args`, `none` | `<id>.sh` carrying the `@raycast.*` metadata header |
| `popclip` | `text` | `<id>.popclipext/` holding `Config.json` and `script.sh` |
| `dropzone` | `files` | `<id>.dzbundle/` holding `action.rb` and `run.sh` |
| `dropover-script` | `files` | `<id>.sh` plus a shared `manifest.json` |
| `shortcuts-cherri` | `text`, `files`, `args`, `none` | `<id>.cherri` source, compiled to `<id>.shortcut` when Cherri is installed |
| `raycast-snippet` | `text`, `none` | shared `snippets.json`, opt in per command via `x.raycast.snippet` |
| `raycast-quicklink` | `args`, `none` | shared `quicklinks.json`, opt in per command via `x.raycast.quicklink` |
| `agent-cli` | all four | executable stub plus `<id>.polycast-meta.json` |

Every persistent install is paired with a `.polycast-owned` marker — a
`<artifact>.polycast-owned` sidecar, or one `.polycast-owned` inside a bundle
directory — so `apply --prune` removes the artifacts polycast wrote and nothing
else. Compiled `.shortcut` files are not imported by ordinary builds or
`apply --write`. Use the separate `--import-shortcuts` flag when an operator
intends to import them into Shortcuts.app. Prune does not remove imported
Shortcuts or compiled files under `build/`; manage those in Shortcuts.app or
remove stale build files yourself.

## Requirements

- **macOS.** The launchers, the install paths, and `open`-based import are all macOS.
- **[bun](https://bun.sh).** Required: it is the runtime, package manager, and
  test runner. `script/setup` fails fast without it.
- **[Cherri](https://github.com/electrikmilk/cherri).** Optional, and only for
  `shortcuts-cherri`: without it the target still emits `<id>.cherri`, and the
  compile step to `<id>.shortcut` is skipped with a notice. Every other target
  needs nothing beyond bun. Set `POLYCAST_SKIP_CHERRI=1` to skip the compile
  even when Cherri is installed.

With Cherri installed, a default build prints one compile warning:

```text
Warning: Value for action argument 'inputType' is the same as the default value.
```

It comes from the `open-repo` sample command, whose generated `prompt(...)` call
passes the `inputType` Cherri would have used anyway. The compile succeeds and
the `.shortcut` is correct, so a clean build is a build with that one warning in
it and nothing else.

## One definition in, one build tree out

`commands/uppercase.ts`:

```ts
import { defineCommand } from "../src/define.ts";

export default defineCommand({
  id: "uppercase",
  title: "Uppercase",
  description: "Convert the selected text to UPPERCASE.",
  icon: "🔠",
  modality: "text",
  author: "polycast",
  body: {
    lang: "bash",
    source: "tr '[:lower:]' '[:upper:]'",
  },
});
```

`bun run dev build --dir commands --strict`, with `uppercase.ts` as the only
file in `commands/` (`--dir <path>` points the build at a different definitions
directory; the repo's own `commands/` holds four samples, so building it
produces more than this):

```text
build/
├── commands/
│   └── uppercase.json
├── popclip/
│   └── uppercase.popclipext/
│       ├── .polycast-owned
│       ├── Config.json
│       └── script.sh
├── shortcuts-cherri/
│   ├── uppercase.cherri
│   ├── uppercase.cherri.polycast-owned
│   ├── uppercase.shortcut
│   └── uppercase.shortcut.polycast-owned
└── agent-cli/
    ├── uppercase
    ├── uppercase.polycast-meta.json
    └── uppercase.polycast-owned
```

Three surfaces, eleven files — nine without Cherri installed, which drops
`uppercase.shortcut` and its marker. `commands/uppercase.json` is the body
store, not a launcher artifact: `apply` syncs it to `~/.polycast/commands/` and
every generated shim reads the body from there.

`raycast-script`, `dropzone`, and `dropover-script` are skipped on purpose: this
command reads a text selection, and none of those three can hand it one.
`raycast-snippet` and `raycast-quicklink` are skipped too — they are opt-in per
command (`x.raycast.snippet` / `x.raycast.quicklink`) and this one does not opt
in, so they emit no directory at all and `apply` reports them as skipped.

The generated files are shims, not copies of the body. Here is
`popclip/uppercase.popclipext/script.sh` in full:

```sh
#!/bin/bash
set -euo pipefail
POLYCAST="${POLYCAST_BIN:-polycast}"
COMMANDS="${POLYCAST_COMMANDS_DIR:-$HOME/.polycast/commands}"
TEXT="$(cat)"
exec "$POLYCAST" run --commands "$COMMANDS" uppercase --text "$TEXT"
```

The body is stored once, as JSON in `~/.polycast/commands/`, which `apply`
syncs. So changing what a command does is a `build` plus an `apply`, and the
installed launcher artifacts stay as they are. You only reinstall them when a
command's metadata or surface list changes.

## Status

P0 complete as of 2026-06-15. Every P0 criterion is validated, including PopClip
and Raycast Level A visual proof, in [`LAUNCH_CRITERIA.md`](LAUNCH_CRITERIA.md).
Level A for Shortcuts is still open and tracked there as P1-5.

What is not there yet: this is macOS only, Dropover import is staged manually
rather than programmatically, and the commands in `commands/` are a sample
pack rather than a library. The `raycast-snippet` and `raycast-quicklink`
emitters produce nothing until a command opts in, which is why the sample build
above writes no `snippets.json`.

- CLI: `list`, `build` (`--strict`), `targets`, `capture` (dry-run-first Raycast
  snippet export capture), `apply` (`--write` to install,
  `--import-shortcuts` for explicit Shortcuts.app import, `--prune` /
  `--prune-only` to uninstall), `run`.
- MCP server (`bun run mcp`): stdio tools mirroring the non-UI CLI operations.
  Compiled Shortcuts are never imported through MCP. See the
  [capability map](docs/agent-native/capability-map.md).
- Portable runners: `runner list`, `runner targets`, and build-only `runner
  build` compile one `RunnerDef` to compatible Orca and Codex CLI artifacts.
  See the [runner compiler guide](docs/guides/runner.md).
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Per-launcher
  format research: `docs/specs/`, mapped in `docs/specs/destination-mapping.md`.

## Quickstart

```sh
script/setup                     # install dependencies (bun)
bun run dev list                 # show commands + which surfaces each supports
bun run dev build                # emit artifacts into ./build/<target>/
bun run dev build --target popclip
bun run dev targets              # list registered emitters
bun run dev runner list          # list RunnerDef files
bun run dev runner targets       # list runner compiler targets
bun run dev runner build         # emit all compatible runner targets into ./build/
bun run dev capture --from raycast-snippets  # preview latest export capture
bun run mcp                      # start MCP stdio server (Cursor / Claude Desktop)
```

### Capture Raycast snippets safely

`capture --from raycast-snippets` turns a Raycast snippets JSON export into
validated `CommandDef` modules under `commands/raycast-snippets/`. It discovers
the newest JSON file in `~/.dotfiles/raycast/snippets/` or a snippet-named JSON
file in `~/Downloads/`. Pass `--input <path>` to select an export explicitly.

Capture is a dry run unless you pass `--write`:

```sh
bun run dev capture --from raycast-snippets
bun run dev capture --from raycast-snippets --write
```

The command never edits or copies the export. It reports only the source path,
SHA-256 digest, counts, and rejection reasons. It does not print rejected names
or text. The committed `capture-report.json` identifies accepted and rejected
rows by zero-based source index so you can review any loss against the preserved
export without copying unsafe content into Git.

The public Polycast repository uses conservative filters. Capture rejects known
credential shapes, high-entropy tokens, personal email and payment data,
Raycast dynamic placeholders, machine-specific paths and private hosts, control
characters, destructive shell shortcuts, agent permission bypasses, text over
8 KiB, invalid records, and keyword or ID collisions.
Raycast tags and unknown fields are omitted from portable definitions and
counted in the loss report. See
[`docs/guides/raycast-snippet-capture.md`](docs/guides/raycast-snippet-capture.md)
for the review and rerun workflow.

### MCP (agent-native)

**Cursor:** open this repo. `.cursor/mcp.json` registers the polycast stdio server automatically (reload the window after pulling).

Other clients, add to your MCP config:

```json
{
  "mcpServers": {
    "polycast": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/polycast"
    }
  }
}
```

Tools: `polycast_list`, `polycast_targets`, `polycast_build`, `polycast_apply`, `polycast_prune`, `polycast_run`, `polycast_command_upsert`. CommandDef shape: [`schemas/command-def.schema.json`](schemas/command-def.schema.json). Apply and upsert default to dry-run; pass `write: true` to mutate.

With [`just`](https://github.com/casey/just): `just setup`, `just test`.

### Install on PATH

Dispatcher stubs call `polycast run` (override with `POLYCAST_BIN`). Options:

```sh
# Dev: repo wrapper (works when symlinked)
ln -sf "$(pwd)/script/polycast" ~/.local/bin/polycast

# Or add script/ to PATH for this clone
export PATH="$(pwd)/script:$PATH"

# Global via bun (package.json bin → src/cli.ts)
bun link
```

Verify: `polycast list` or `script/polycast list`.

Commands live in `commands/*.ts`, each default-exporting a `CommandDef` via
`defineCommand(...)`. Sample pack: [`commands/README.md`](commands/README.md).
Walkthrough: [`docs/guides/first-command.md`](docs/guides/first-command.md).

## Where apply writes

`apply` is a dry run by default and only prints what it would do. `apply
--write` installs into the real launcher directories below, so a `--write` run
changes live launcher configuration on the machine it runs on. Every one of
those paths has an environment override, and I point them at a scratch
directory whenever I want to exercise the install path without touching my own
setup.

| Target | Override | Default |
|---|---|---|
| `raycast-script` | `POLYCAST_RAYCAST_DIR` | `~/.polycast/raycast` |
| `popclip` | `POLYCAST_POPCLIP_EXTENSIONS` | `~/Library/Application Support/PopClip/Extensions` |
| `dropzone` | `POLYCAST_DROPZONE_ACTIONS` | `~/Library/Application Support/Dropzone 5/Actions` |
| `dropover-script` | `POLYCAST_DROPOVER_SCRIPTS` | `~/Library/Containers/me.damir.dropover-mac/Data/Documents/.polycast-scripts` |
| `agent-cli` | `POLYCAST_AGENT_BIN` | `~/.agents/tools` |
| JSON body store | `POLYCAST_COMMANDS_DIR` | `~/.polycast/commands` |

```sh
POLYCAST_POPCLIP_EXTENSIONS=/tmp/pc-sandbox/pc \
POLYCAST_AGENT_BIN=/tmp/pc-sandbox/bin \
POLYCAST_COMMANDS_DIR=/tmp/pc-sandbox/cmds \
  bun run dev apply --target popclip,agent-cli --write
```

`shortcuts-cherri` is the one target with no such override. A normal
`apply --write` leaves compiled `.shortcut` files in the build tree and syncs
the JSON body store without opening Shortcuts.app. To import them, run the
following command deliberately on the operator's Mac:

```sh
bun run dev apply --write --import-shortcuts --target shortcuts-cherri
```

`--import-shortcuts` is required in addition to `--write`; it is never enabled
by builds, tests, or the dogfood installer by default. `POLYCAST_SKIP_CHERRI=1`
still skips compilation when Cherri is installed, while the explicit consent
gate protects apply even when `.shortcut` files already exist.

### Uninstalling

`apply --prune` removes the artifacts polycast installed and then installs the
current build. `apply --prune-only` removes them and stops. Both follow the same
dry-run rule as apply, so add `--write` to actually delete anything:

```sh
bun run dev apply --prune-only            # list what would be removed
bun run dev apply --prune-only --write    # remove it
```

Prune walks the `.polycast-owned` markers described above, so it removes only
the files polycast wrote, plus the JSON body store. Anything else in those
directories is left alone: a hand-written PopClip extension sitting next to a
generated one survives the prune. Imported Shortcuts and compiled files under
`build/` are outside that scan.

## Stack

Node.js / TypeScript (bun).

## Development

- Entrypoints live in `script/` (Scripts to Rule Them All); `just --list` shows them.
- CI runs `script/cibuild`. Run it locally before opening a PR.
- `script/cibuild` also checks package/runtime/MCP version consistency and
  smoke-tests the packed npm artifact without publishing it.
- `bun test`, `bun run typecheck`, `bun run lint`.
- Tests never shell out to Cherri: `bunfig.toml` preloads `test/setup.ts`, which defaults `POLYCAST_SKIP_CHERRI=1` for `bun test`, `script/test`, and CI alike (structural `.cherri` tests still run). Compiled `.shortcut` files are also never imported by automated paths. Compile locally with `POLYCAST_SKIP_CHERRI=0 bun run dev build --target shortcuts-cherri`, then use `apply --write --import-shortcuts` only for manual Shortcuts.app verification.
- See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the module map and [`docs/DESIGN.md`](docs/DESIGN.md) for the roadmap.
- Platform specs: [`docs/specs/README.md`](docs/specs/README.md).
- Research: [`docs/research/2026-06-14-destination-emitters-findings.md`](docs/research/2026-06-14-destination-emitters-findings.md).
- Verification logs: [`docs/verification/README.md`](docs/verification/README.md).
- Level A dogfood (launch gate): `./script/dogfood-level-a --install --check-b`, documented in [`docs/verification/level-a-dogfood.md`](docs/verification/level-a-dogfood.md).

## License

MIT, see [LICENSE](LICENSE).
