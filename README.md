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
| `shortcuts-cherri` | `text`, `args`, `none` | `<id>.cherri` source, compiled to `<id>.shortcut` when Cherri is installed |
| `raycast-snippet` | `text`, `none` | shared `snippets.json`, opt in per command via `x.raycast.snippet` |
| `raycast-quicklink` | `args`, `none` | shared `quicklinks.json`, opt in per command via `x.raycast.quicklink` |
| `agent-cli` | all four | executable stub plus `<id>.polycast-meta.json` |

Every installed artifact is paired with a `.polycast-owned` marker — a
`<artifact>.polycast-owned` sidecar, or one `.polycast-owned` inside a bundle
directory — so `apply --prune` removes the artifacts polycast wrote and nothing
else. Compiled `.shortcut` files are the exception in practice: they are
imported into the Shortcuts app rather than installed to a directory polycast
owns, so prune can remove the build artifact but never the imported shortcut.

## Requirements

- **macOS.** The launchers, the install paths, and `open`-based import are all macOS.
- **[bun](https://bun.sh).** Required: it is the runtime, package manager, and
  test runner. `script/setup` fails fast without it.
- **[Cherri](https://github.com/electrikmilk/cherri).** Optional, and only for
  `shortcuts-cherri`: without it the target still emits `<id>.cherri`, and the
  compile step to `<id>.shortcut` is skipped with a notice. Every other target
  needs nothing beyond bun. Set `POLYCAST_SKIP_CHERRI=1` to skip the compile
  even when Cherri is installed.

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
rather than programmatically, and the four commands in `commands/` are a sample
pack rather than a library. The `raycast-snippet` and `raycast-quicklink`
emitters produce nothing until a command opts in, which is why the sample build
above writes no `snippets.json`.

- CLI: `list`, `build` (`--strict`), `targets`, `apply` (`--write` to install), `run`.
- MCP server (`bun run mcp`): stdio tools mirroring the CLI. See the
  [capability map](docs/agent-native/capability-map.md).
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Per-launcher
  format research: `docs/specs/`, mapped in `docs/specs/destination-mapping.md`.

## Quickstart

```sh
script/setup                     # install dependencies (bun)
bun run dev list                 # show commands + which surfaces each supports
bun run dev build                # emit artifacts into ./build/<target>/
bun run dev build --target popclip
bun run dev targets              # list registered emitters
bun run mcp                      # start MCP stdio server (Cursor / Claude Desktop)
```

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

## Stack

Node.js / TypeScript (bun).

## Development

- Entrypoints live in `script/` (Scripts to Rule Them All); `just --list` shows them.
- CI runs `script/cibuild`. Run it locally before opening a PR.
- `bun test`, `bun run typecheck`, `bun run lint`.
- Tests never shell out to Cherri: `bunfig.toml` preloads `test/setup.ts`, which defaults `POLYCAST_SKIP_CHERRI=1` for `bun test`, `script/test`, and CI alike (structural `.cherri` tests still run). Compile locally with `POLYCAST_SKIP_CHERRI=0 bun run dev build --target shortcuts-cherri`.
- See [`AGENTS.md`](AGENTS.md) for the working agreement,
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the module map, and
  [`docs/DESIGN.md`](docs/DESIGN.md) for the roadmap.
- Platform specs: [`docs/specs/README.md`](docs/specs/README.md).
- Research: [`docs/research/2026-06-14-destination-emitters-findings.md`](docs/research/2026-06-14-destination-emitters-findings.md).
- Verification logs: [`docs/verification/README.md`](docs/verification/README.md).
- Level A dogfood (launch gate): `./script/dogfood-level-a --install --check-b`, documented in [`docs/verification/level-a-dogfood.md`](docs/verification/level-a-dogfood.md).

## License

MIT, see [LICENSE](LICENSE).
