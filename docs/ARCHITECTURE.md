# Architecture

polycast is a transcompiler for macOS launcher commands. One canonical command
definition (`CommandDef`) is rendered into each launcher's native format by a
per-target emitter. It is a local codegen CLI and command dispatcher, plus an
MCP server over the same API. It does not run a long-lived production service.

## Module map

| Path | Role |
|------|------|
| `src/types.ts` | The IR: `CommandDef` (metadata + body + `Modality`) and the `Emitter` interface. |
| `src/define.ts` | `defineCommand()` authoring helper plus structural validation. |
| `src/load.ts` | Loads `commands/*.ts` modules (default-exported `CommandDef`). |
| `src/commands-store.ts` | Writes `build/commands/<id>.json` and loads the JSON body store used by `run`. |
| `src/emitters/*` | One module per target. `src/registry.ts` is the list. |
| `src/validate/` | Runs emitter validation and applies strict or default severity rules. |
| `src/post-build.ts` | Compiles `.cherri` files to `.shortcut` files when Cherri is available. |
| `src/cli.ts` | `polycast list \| build \| targets \| apply \| run` (entry and `bin`). |
| `src/polycast-api.ts` | Shared API used by both the CLI and the MCP tools. |
| `src/mcp/server.ts` | stdio MCP server (`bun run mcp`). |
| `src/mcp/command-upsert-tool.ts` | Description and schema pointer for `polycast_command_upsert`. |
| `src/schema/command-def.ts` | Runtime Zod parser and generated JSON Schema for command input. |
| `commands/*.ts` | The command definitions themselves — data, not engine. |

## Command lifecycle

1. `loadCommands` imports each default-exported `CommandDef` from the selected
   `commands/` directory and validates its shape.
2. `polycastBuild` writes one JSON body file at
   `build/commands/<id>.json` and the native files produced by compatible
   emitters. The output root is configurable.
3. Thin launcher shims call `polycast run --commands <dir> <id>`. For targets
   that use the dispatcher, `apply --write` copies the JSON body store to
   `POLYCAST_COMMANDS_DIR` and installs the launcher files.
4. `polycastRun` loads the JSON file, validates its command ID, and executes the
   stored body with the modality-specific stdin or argument contract.
5. The MCP tool `polycast_command_upsert` serializes a validated `CommandDef` as
   a TypeScript module. `write: false` returns the module text without editing
   the repository. `write: true` writes `commands/<id>.ts`. `previewBuild: true`
   builds that command in an isolated temporary directory; it does not install
   the result.

## The load-bearing idea: the I/O modality contract

Each launcher differs mainly in *what the body receives*. PopClip sends the
selection to stdin because the generated `Config.json` sets `stdin: text`.
Dropzone passes dragged file paths (`"$@"`). Raycast passes typed arguments.
Shortcuts passes a share-sheet input.

The body is authored once as a pure `input → stdout` function, and each emitter
injects the wrapper that adapts its surface's native input into that contract.
An emitter declares which modalities it `supports` and returns `[]` for anything
it cannot represent, so `build` skips a surface rather than mis-emitting for it.

This is the decision that makes one definition safe to cast everywhere: the
generator never guesses at a mapping it cannot honor. See `src/registry.ts` for
the support declarations and `docs/specs/modality-matrix.md` for the matrix.

## Key decisions

- **The IR is an extended Raycast script-command header.** Adopt the richest
  existing dialect rather than invent a new format, and add a small `x.<target>`
  namespace for surface-specific hints.
- **Thin shims, not copied logic.** Generated artifacts are small stubs that
  call back into one dispatcher (`polycast run`) rather than each carrying a
  copy of the body.
- **biome v2** is the linter and formatter, pinned to `^2.5.0`.

## Constraints and gotchas

- `apply` installs into launcher runtime directories. It is dry-run by default;
  `--write` mutates. Ownership markers (`.polycast-owned`) gate safe pruning.
  See `src/apply.ts` and `docs/specs/destination-mapping.md`.
- `shortcuts-cherri` keeps compiled `.shortcut` files in the build tree. A
  normal `apply --write` never opens a UI; `--import-shortcuts` is a separate
  operator-consent flag for importing them. `apply --prune` does not remove
  imported Shortcuts or stale files under `build/shortcuts-cherri/`.
- PopClip uses native `stdin: text` in `Config.json`, so bodies read stdin.
- macOS-only by design, since these are macOS launchers.
- No external services and no secrets. Local codegen only.

## Environments

| Env | Command | Notes |
|-----|---------|-------|
| local | `bun run dev <cmd>` | `build` writes to `./build/<target>/` (gitignored) |
| ci | `script/cibuild` | install → lint → typecheck → test → dist build → `dev build --strict` |
