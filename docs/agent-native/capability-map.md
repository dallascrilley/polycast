# Agent-native capability map — polycast

Maps user/operator actions to agent-accessible surfaces. Target: full parity with `polycast` CLI (`src/cli.ts`).

Last updated: 2026-06-15

## CLI commands (source of truth today)

| User action | CLI | Agent tool | Status |
|-------------|-----|------------|--------|
| List commands + surfaces | `polycast list [--dir]` | `polycast_list` | implemented |
| List emitter targets | `polycast targets` | `polycast_targets` | implemented |
| Build artifacts | `polycast build [--strict]` | `polycast_build` | implemented |
| Install to launchers | `polycast apply [--write]` | `polycast_apply` | implemented |
| Prune owned installs | `polycast apply --prune-only [--write]` | `polycast_prune` | implemented |
| Run command via dispatcher | `polycast run <id>` | `polycast_run` | implemented |
| Author command module | edit `commands/<id>.ts` | `polycast_command_upsert` | implemented (`previewBuild` for isolated validate) |

## Out of scope (v1 agent-native)

- Mutating Dropover prefs / instant-action store (storage opaque — see [dropover import research](../research/2026-06-15-dropover-import-findings.md))
- Cherri compile on agents without macOS + `cherri` binary
- Forge install/promote (optional post-step; document only)

## Implementation

See [docs/plans/2026-06-15-feat-agent-native-mcp-plan.md](../plans/2026-06-15-feat-agent-native-mcp-plan.md).
