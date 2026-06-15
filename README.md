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
- A pluggable **emitter registry** (`src/registry.ts`). Adding a launcher = one
  emitter; every existing command instantly gains the surface.
- Two real emitters: `raycast-script` (args/none) and `popclip` (text).
- A CLI: `list`, `build`, `targets` (`apply` is stubbed).

## Quickstart

```sh
script/setup                     # install dependencies (bun)
bun run dev list                 # show commands + which surfaces each supports
bun run dev build                # emit artifacts into ./build/<target>/
bun run dev build --target popclip
bun run dev targets              # list registered emitters
```

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
- See [`AGENTS.md`](AGENTS.md) for the working agreement and
  [`docs/DESIGN.md`](docs/DESIGN.md) for the architecture and roadmap.

## License

TODO: choose a license
