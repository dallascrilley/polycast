import { OWNERSHIP_MARKER, POLYCAST_CREATOR, POLYCAST_URL } from "../constants.ts";
import type { CommandDef, EmittedFile, Emitter, ValidationIssue } from "../types.ts";
import { wrappedScript } from "../wrappers.ts";

export const dropzone: Emitter = {
  target: "dropzone",
  supports: ["files"],

  emit(cmd: CommandDef): EmittedFile[] {
    if (!this.supports.includes(cmd.modality)) return [];

    const handles = cmd.x?.dropzone?.handles ?? "Files";
    const events = cmd.x?.dropzone?.events?.join(", ") ?? "Dragged";
    const skipConfig = cmd.x?.dropzone?.skipConfig !== false ? "Yes" : "No";
    const minVer = cmd.x?.dropzone?.minVersion ?? "4.0";

    const header = [
      `# Name: ${cmd.title}`,
      `# Description: ${cmd.description}`,
      `# Handles: ${handles}`,
      `# Events: ${events}`,
      `# Creator: ${cmd.author ?? POLYCAST_CREATOR}`,
      `# URL: ${POLYCAST_URL}`,
      `# SkipConfig: ${skipConfig}`,
      `# MinDropzoneVersion: ${minVer}`,
      "",
    ].join("\n");

    const ruby = [
      header,
      "def dragged",
      "  script = File.join(File.dirname(__FILE__), 'run.sh')",
      "  system(script, *items)",
      "end",
      "",
    ].join("\n");

    return [
      { path: `${cmd.id}.dzbundle/action.rb`, contents: ruby },
      { path: `${cmd.id}.dzbundle/run.sh`, contents: wrappedScript(cmd), mode: 0o755 },
      { path: `${cmd.id}.dzbundle/${OWNERSHIP_MARKER}`, contents: "polycast\n" },
    ];
  },

  validate(_cmd: CommandDef, files: readonly EmittedFile[]): ValidationIssue[] {
    const action = files.find((f) => f.path.endsWith("action.rb"));
    if (!action) {
      return [{ target: this.target, message: "missing action.rb", severity: "error" }];
    }
    for (const field of ["# Name:", "# Description:", "# Handles:", "# Creator:", "# URL:"]) {
      if (!action.contents.includes(field)) {
        return [{ target: this.target, message: `action.rb missing ${field}`, severity: "error" }];
      }
    }
    return [];
  },
};
