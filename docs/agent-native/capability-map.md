# Agent-native capability map — polycast

Maps user/operator actions to agent-accessible surfaces. Target: full parity with `polycast` CLI (`src/cli.ts`).

Last updated: 2026-06-15

## CLI commands (source of truth today)

| User action | CLI | Agent tool (planned) | Status |
|-------------|-----|----------------------|--------|
| List commands + surfaces | `polycast list [--dir]` | `polycast_list` | planned |
| List emitter targets | `polycast targets` | `polycast_targets` | planned |
| Build artifacts | `polycast build [--strict]` | `polycast_build` | planned |
| Install to launchers | `polycast apply [--write]` | `polycast_apply` | planned |
| Prune owned installs | `polycast apply --prune-only [--write]` | `polycast_prune` | planned |
| Run command via dispatcher | `polycast run <id>` | `polycast_run` | planned |
| Author command module | edit `commands/<id>.ts` | `polycast_command_upsert` | planned |

## Out of scope (v1 agent-native)

- Mutating Dropover prefs / instant-action store (storage opaque — see [dropover import research](../research/2026-06-15-dropover-import-findings.md))
- Cherri compile on agents without macOS + `cherri` binary
- Forge install/promote (optional post-step; document only)

## Implementation

See [docs/plans/2026-06-15-feat-agent-native-mcp-plan.md](../plans/2026-06-15-feat-agent-native-mcp-plan.md).
