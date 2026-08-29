# Agent-native capability map — polycast

Maps user/operator actions to agent-accessible surfaces. Target: full parity with `polycast` CLI (`src/cli.ts`).

Last updated: 2026-08-26

Thin-shim dispatchers (including Shortcuts Cherri) delegate to `polycast run` and
sync `~/.polycast/commands/` on `apply --write`.

## Tool parity and defaults

The MCP server exposes the same core operations as the CLI. MCP input uses
camelCase field names such as `previewBuild` and `commandsDir`.

| User action | CLI | Agent tool | Default or result |
|-------------|-----|------------|------------------|
| List commands and surfaces | `polycast list [--dir]` | `polycast_list` | `dir` is `commands`; returns structured command entries. |
| List emitter targets | `polycast targets` | `polycast_targets` | Returns each target and its supported modalities. |
| Build artifacts | `polycast build [--strict]` | `polycast_build` | CLI output defaults to `./build`; MCP output defaults to a temporary directory unless `out` is set. |
| Install to launchers | `polycast apply [--write]` | `polycast_apply` | Dry-run by default; `write: true` installs from `out`, which defaults to `./build`. Compiled Shortcuts are never imported by the MCP tool; the CLI requires `--import-shortcuts` in addition to `--write`. |
| Prune owned installs | `polycast apply --prune-only [--write]` | `polycast_prune` | Dry-run by default; `write: true` removes marked files from persistent install roots. |
| Run a command | `polycast run <id>` | `polycast_run` | Loads `<commandsDir>/<id>.json`; returns `{ id, exitCode }`. |
| Author a command module | edit `commands/<id>.ts` | `polycast_command_upsert` | Returns generated TypeScript; writes only with `write: true`. |

`polycast_apply` and `polycast_prune` use the install paths selected by the
`POLYCAST_*` environment variables. They do not redirect those paths through
the MCP request. See the [destination mapping](../specs/destination-mapping.md)
for the full path table.

## Author a command through MCP

`polycast_command_upsert` accepts a `CommandDef` JSON object. The committed
[`schemas/command-def.schema.json`](../../schemas/command-def.schema.json) JSON
Schema is Draft 2020-12. It enforces the required properties, field types,
enum values, and kebab-case `id`. It requires `body.source` to be a string, but
it does not require that string to be non-empty or require `args` when
`modality` is `args`. The runtime Zod parser adds those refinements:
`body.source` must be non-empty for script bodies, `body.executable` must be
non-empty for `lang: "exec"`, and `modality: "args"` must include at least
one `args` entry.

Use this input to preview a command and its strict build without changing the
repository:

```json
{
  "command": {
    "id": "say-hello",
    "title": "Say Hello",
    "description": "Print a greeting.",
    "modality": "none",
    "body": {
      "lang": "bash",
      "source": "printf 'hello\\n'"
    }
  },
  "write": false,
  "previewBuild": true,
  "strict": true
}
```

The response includes `path`, the generated `preview`, `written: false`, the
schema path, and a `buildPreview` summary. Set `write: true` to write the
generated module to `dir/<id>.ts`, where `dir` defaults to `commands`. The
upsert does not build or install a written command unless you also call
`polycast_build` and `polycast_apply`.

## Mutation boundaries

- `polycast_build` writes only to its `out` directory. Leave `out` unset for an
  isolated MCP preview, or set it when a later `polycast_apply` must consume the
  output.
- `polycast_apply` checks the build output and refuses to overwrite an existing
  path without a `.polycast-owned` marker. It skips incompatible or opt-in
  targets that produced no output. It never imports compiled Shortcuts; the
  CLI's separate `--import-shortcuts` flag is required for that UI action.
- `polycast_prune` removes only marked files in persistent install roots and the
  shared JSON body store. It does not remove imported Shortcuts or files in the
  build output directory.
- `polycast_run` executes the body stored in JSON. A launcher shim can keep its
  installed bytes while a new `apply --write` syncs the body store.

## Out of scope (v1 agent-native)

- Mutating Dropover prefs / instant-action store (storage opaque — see [dropover import research](../research/2026-06-15-dropover-import-findings.md))
- Cherri compile on agents without macOS + `cherri` binary
- Forge install/promote (optional post-step; document only)

## Implementation

Server: `src/mcp/server.ts`. Shared API behind both CLI and MCP:
`src/polycast-api.ts`. Smoke log: [`../verification/2026-06-15-mcp-smoke.md`](../verification/2026-06-15-mcp-smoke.md).
