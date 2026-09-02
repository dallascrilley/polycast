import { OWNERSHIP_MARKER } from "../constants.ts";
import { REMOTE_PROTOCOL_VERSION } from "../remote.ts";
import type { CommandDef, EmittedFile, Emitter } from "../types.ts";

/**
 * Termux:Widget executes this script in the existing tablet-owned mac-exec
 * transport. It deliberately owns no SSH host, key, or general configuration.
 */
export const termuxShortcut: Emitter = {
  target: "termux-shortcut",
  supports: ["text", "none"],

  emit(cmd: CommandDef): EmittedFile[] {
    if (!this.supports.includes(cmd.modality) || !cmd.x?.remote) return [];
    const script = [
      "#!/data/data/com.termux/files/usr/bin/bash",
      "set -euo pipefail",
      'MAC_EXEC="${POLYCAST_TERMUX_MAC_EXEC:-mac-exec}"',
      `exec "$MAC_EXEC" polycast-remote --command ${cmd.id} --protocol ${REMOTE_PROTOCOL_VERSION}`,
      "",
    ].join("\n");
    return [
      { path: `${cmd.id}.sh`, contents: script, mode: 0o755 },
      { path: `${cmd.id}.sh${OWNERSHIP_MARKER}`, contents: "polycast\n" },
    ];
  },
};
