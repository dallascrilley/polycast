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

Early skeleton. Working vertical slice:

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

Add to your MCP client config:

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

Tools: `polycast_list`, `polycast_targets`, `polycast_build`, `polycast_apply`, `polycast_prune`, `polycast_run`, `polycast_command_upsert`. Apply and upsert default to dry-run; pass `write: true` to mutate. See [`docs/agent-native/capability-map.md`](docs/agent-native/capability-map.md).

With [`just`](https://github.com/casey/just): `just setup`, `just test`.

Commands live in `commands/*.ts`, each default-exporting a `CommandDef` via
`defineCommand(...)`. See `commands/uppercase.ts` (text → PopClip) and
`commands/open-repo.ts` (args → Raycast).

## Stack

Node.js / TypeScript (bun).

## Development

- Entrypoints live in `script/` (Scripts to Rule Them All); `just --list` shows them.
- CI runs `script/cibuild` — run it locally before opening a PR.
- `bun test`, `bun run typecheck`, `bun run lint`.
- `POLYCAST_SKIP_CHERRI=1` skips Shortcuts Cherri compile when `cherri` is not installed (CI sets this). Build still emits `.cherri` sources; run `cherri build/shortcuts-cherri/*.cherri` locally or use `apply --write` after compile to import `.shortcut` files.
- See [`AGENTS.md`](AGENTS.md) for the working agreement and
  [`docs/DESIGN.md`](docs/DESIGN.md) for the architecture and roadmap.
- Platform specs: [`docs/specs/README.md`](docs/specs/README.md).
- Research: [`docs/research/2026-06-14-destination-emitters-findings.md`](docs/research/2026-06-14-destination-emitters-findings.md).

## License

MIT — see [LICENSE](LICENSE).
