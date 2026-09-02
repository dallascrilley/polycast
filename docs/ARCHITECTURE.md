# Architecture

polycast is a transcompiler for macOS launcher commands. One canonical command
definition (`CommandDef`) is rendered into each launcher's native format by a
per-target emitter. It is a local codegen CLI and command dispatcher, plus an
MCP server over the same API. It does not run a long-lived production service.

## Module map

| Path | Role |
|------|------|
| `src/types.ts` | The IR: `CommandDef` (metadata + script or exec body + `Modality`) and the `Emitter` interface. |
| `src/file-to-inbox.ts` | Headless file-to-Inbox implementation: copy, collisions, Review tag, receipts. |
| `src/define.ts` | `defineCommand()` authoring helper plus structural validation. |
| `src/load.ts` | Loads `commands/*.ts` modules (default-exported `CommandDef`). |
| `src/commands-store.ts` | Writes `build/commands/<id>.json` and loads the JSON body store used by `run`. |
| `src/emitters/*` | One module per target. `src/registry.ts` is the list. |
| `src/validate/` | Runs emitter validation and applies strict or default severity rules. |
| `src/post-build.ts` | Compiles `.cherri` files to `.shortcut` files when Cherri is available. |
| `src/cli.ts` | `polycast list \| build \| targets \| capture \| apply \| run` (entry and `bin`). |
| `src/importers/raycast-snippets.ts` | Validates and filters Raycast exports, plans deterministic capture output, and owns generated capture files. |
| `src/polycast-api.ts` | Shared API used by both the CLI and the MCP tools. |
| `src/mcp/server.ts` | stdio MCP server (`bun run mcp`). |
| `src/mcp/command-upsert-tool.ts` | Description and schema pointer for `polycast_command_upsert`. |
| `src/schema/command-def.ts` | Runtime Zod parser and generated JSON Schema for command input. |
| `commands/*.ts` | The command definitions themselves — data, not engine. |
| `src/runners/schema.ts` | Canonical target-neutral `RunnerDef` parser and the legacy Orca normalizer. |
| `src/runners/registry.ts` | Typed runner target registry, compatibility checks, and emission routing. |
| `src/runners/orca-plugin.ts` | Orca manifest and worker adapter. |
| `src/runners/codex-cli.ts` | Build-only Codex CLI wrapper, prompt, and metadata adapter. |
| `src/runner-api.ts` | Runner-wide preflight, unique-path validation, file writes, and mode application. |
| `runners/*.ts` | Portable runner definitions, kept separate from `CommandDef`. |

## Command lifecycle

1. `loadCommands` imports each default-exported `CommandDef` from the selected
   `commands/` directory and validates its shape.
2. A definition may declare a non-empty `targets` allowlist. The registry skips
   it everywhere else before per-command or catalog emission. Captured snippets
   use this to avoid generating unrelated launcher artifacts.
3. `polycastBuild` writes one JSON body file at
   `build/commands/<id>.json` and the native files produced by compatible
   emitters. The output root is configurable.
4. Thin local launcher shims call `polycast run --commands <dir> <id>`. Remote
   targets send a fixed command ID plus protocol version to `polycast remote`
   on the host; they never carry body source. For targets
   that use the dispatcher, `apply --write` copies the JSON body store to
   `POLYCAST_COMMANDS_DIR` and installs the launcher files.
5. `polycastRun` loads the JSON file, validates its command ID, and executes the
   stored body with the modality-specific stdin or argument contract.
6. The MCP tool `polycast_command_upsert` serializes a validated `CommandDef` as
   a TypeScript module. `write: false` returns the module text without editing
   the repository. `write: true` writes `commands/<id>.ts`. `previewBuild: true`
   builds that command in an isolated temporary directory; it does not install
   the result.

## The load-bearing idea: the I/O modality contract

Each launcher differs mainly in *what the body receives*. PopClip sends the
selection to stdin because the generated `Config.json` sets `stdin: text`.
Dropzone passes dragged file paths (`"$@"`). Raycast passes typed arguments.
Shortcuts passes a share-sheet input.

The body is authored once as a pure `input → stdout` function, or as `lang:
"exec"` pointing at a headless program. Each emitter injects the wrapper that
adapts its surface's native input into that contract. File-organization policy
lives in the executable, not in launcher shims. See
[`docs/decisions/0001-exec-body-file-to-inbox.md`](decisions/0001-exec-body-file-to-inbox.md).
An emitter declares which modalities it `supports` and returns `[]` for anything
it cannot represent, so `build` skips a surface rather than mis-emitting for it.

A Toolbox-backed command adds the versioned `delegation` contract described in
[`docs/decisions/0002-toolbox-adapter-contract.md`](decisions/0002-toolbox-adapter-contract.md).
Its `exec` body names the verified canonical executable and fixed command prefix;
Polycast owns only launcher adaptation and passes canonical results through.

This is the decision that makes one definition safe to cast everywhere: the
generator never guesses at a mapping it cannot honor. See `src/registry.ts` for
the support declarations and `docs/specs/modality-matrix.md` for the matrix.

## Runner compiler lifecycle

1. `loadRunners` imports each `RunnerDef`, normalizes the deprecated Orca shape,
   and retains source-level deprecation warnings.
2. The runner registry checks every definition against every selected target.
   Orca requires an engine hint. Codex CLI rejects a runner if any command uses
   `mode: "stage"`.
3. An implicit build records incompatible targets as skipped. An explicit bad
   selection fails the whole build.
4. Polycast renders all compatible files and rejects unsafe or duplicate paths
   before creating a directory. It then writes files and applies executable
   modes, including when an existing file had mode `0644`.
5. Generated runner artifacts remain build-only. Polycast does not install
   them, launch hosts, or modify Orca or Codex configuration.

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
- `shortcuts-remote-ssh` is opt-in through `x.remote.profile`; its build output
  contains private connection metadata and must be transferred directly to the
  intended iOS device. Shortcuts owns the SSH key; the host accepts it only
  through the forced remote protocol.
- `capture --from raycast-snippets` reads a regular export file and writes only
  its marked `commands/raycast-snippets/` files when `--write` is present. It
  never changes or copies the export. Build recursively loads the generated
  modules through the same `CommandDef` validator as hand-authored commands.
- PopClip uses native `stdin: text` in `Config.json`, so bodies read stdin.
- macOS-only by design, since these are macOS launchers.
- No external services and no secrets. Local codegen only.

## Environments

| Env | Command | Notes |
|-----|---------|-------|
| local | `bun run dev <cmd>` | `build` writes to `./build/<target>/` (gitignored) |
| ci | `script/cibuild` | install → lint → typecheck → test → dist build → `dev build --strict` |
