import type { CommandDef } from "./types.ts";

/** Thin executable stub that delegates to polycast run. */
export function agentCliShim(cmd: CommandDef): string {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'POLYCAST="${POLYCAST_BIN:-polycast}"',
    'COMMANDS="${POLYCAST_COMMANDS_DIR:-$HOME/.polycast/commands}"',
    `exec "$POLYCAST" run --commands "$COMMANDS" ${cmd.id} "$@"`,
    "",
  ].join("\n");
}
