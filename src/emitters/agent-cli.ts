import { OWNERSHIP_MARKER, POLYCAST_VERSION } from "../constants.ts";
import { agentCliShim } from "../shim.ts";
import type { CommandDef, EmittedFile, Emitter, ValidationIssue } from "../types.ts";

export const agentCli: Emitter = {
  target: "agent-cli",
  supports: ["text", "files", "args", "none"],

  emit(cmd: CommandDef): EmittedFile[] {
    if (!this.supports.includes(cmd.modality)) return [];

    const meta = {
      id: cmd.id,
      title: cmd.title,
      description: cmd.description,
      modality: cmd.modality,
      polycastVersion: POLYCAST_VERSION,
      dispatcher: "polycast run",
    };

    return [
      { path: cmd.id, contents: agentCliShim(cmd), mode: 0o755 },
      { path: `${cmd.id}.polycast-meta.json`, contents: `${JSON.stringify(meta, null, 2)}\n` },
      { path: `${cmd.id}${OWNERSHIP_MARKER}`, contents: "polycast\n" },
    ];
  },

  validate(cmd: CommandDef, files: readonly EmittedFile[]): ValidationIssue[] {
    const bin = files.find((f) => f.path === cmd.id);
    if (!bin?.contents.startsWith("#!")) {
      return [{ target: this.target, message: "missing executable shebang", severity: "error" }];
    }
    if (!bin.contents.includes(" run --commands ")) {
      return [
        { target: this.target, message: "missing polycast run dispatcher stub", severity: "error" },
      ];
    }
    const meta = files.find((f) => f.path.endsWith(".polycast-meta.json"));
    if (!meta?.contents.includes(`"id": "${cmd.id}"`)) {
      return [{ target: this.target, message: "missing meta sidecar", severity: "error" }];
    }
    return [];
  },
};
