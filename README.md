# polycast

**One command definition, cast to many macOS launchers.**

macOS has a sprawl of "do-a-verb" launchers — Raycast script commands, PopClip
extensions, Dropzone actions, Apple/iOS Shortcuts, plus your own agent CLIs —
and each one re-implements the same logic in its own format. Edit one, the
others drift.

polycast treats every surface as the same triple — **metadata header + script
body + I/O contract** — and generates the per-launcher artifacts from a single
definition. Write a command once; cast it everywhere.

## Repository

[dallascrilley/polycast](https://github.com/dallascrilley/polycast)

## Status

Pre-launch **P0 complete** (2026-06-15). All P0 launch criteria validated including
PopClip + Raycast Level A — see [`LAUNCH_CRITERIA.md`](LAUNCH_CRITERIA.md).
P1-5 Shortcuts Level A remains optional follow-up.

Working vertical slice:

- A canonical command IR (`src/types.ts`) with an explicit **I/O modality**
  (`text | files | args | none`) — the semantic that lets one body render to
  multiple surfaces and skip the ones it can't represent.
- A pluggable **emitter registry** (`src/registry.ts`) with eight targets:
  `raycast-script`, `popclip`, `dropzone`, `dropover-script`, `shortcuts-cherri`,
  `raycast-snippet`, `raycast-quicklink`, `agent-cli`.
- CLI: `list`, `build` (`--strict`), `targets`, `apply` (`--write` to install), `run`.
- **MCP server** (`bun run mcp`): stdio tools mirroring CLI — see [capability map](docs/agent-native/capability-map.md).
- Platform specs in `docs/specs/`; mapping in `docs/specs/destination-mapping.md`.

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

**Cursor:** open this repo — `.cursor/mcp.json` registers the polycast stdio server automatically (reload window after pull).

Other clients — add to MCP config:

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
- CI runs `script/cibuild` — run it locally before opening a PR.
- `bun test`, `bun run typecheck`, `bun run lint`.
- `script/test` and CI set `POLYCAST_SKIP_CHERRI=1` so tests skip Cherri compile (structural `.cherri` tests still run). Compile locally: unset the var and run `bun run dev build --target shortcuts-cherri`.
- See [`AGENTS.md`](AGENTS.md) for the working agreement and
  [`docs/DESIGN.md`](docs/DESIGN.md) for the architecture and roadmap.
- Platform specs: [`docs/specs/README.md`](docs/specs/README.md).
- Research: [`docs/research/2026-06-14-destination-emitters-findings.md`](docs/research/2026-06-14-destination-emitters-findings.md).
- Verification logs: [`docs/verification/README.md`](docs/verification/README.md).
- Level A dogfood (launch gate): `./script/dogfood-level-a --install --check-b` — see [`docs/verification/level-a-dogfood.md`](docs/verification/level-a-dogfood.md).

## License

MIT — see [LICENSE](LICENSE).
