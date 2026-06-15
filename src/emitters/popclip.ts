import { OWNERSHIP_MARKER } from "../constants.ts";
import { popclipScriptShim } from "../shim.ts";
import type { CommandDef, EmittedFile, Emitter, ValidationIssue } from "../types.ts";

/**
 * Emits a PopClip shell-script extension with native `stdin: text` wiring.
 */
export const popclip: Emitter = {
  target: "popclip",
  supports: ["text"],

  emit(cmd: CommandDef): EmittedFile[] {
    if (!this.supports.includes(cmd.modality)) return [];

    const action: Record<string, unknown> = {
      title: cmd.title,
      "shell script file": "script.sh",
      stdin: "text",
    };
    if (cmd.x?.popclip?.regex) action.regex = cmd.x.popclip.regex;
    if (cmd.x?.popclip?.after) action.after = cmd.x.popclip.after;
    if (cmd.x?.popclip?.requirements) action.requirements = cmd.x.popclip.requirements;

    const config = {
      identifier: `com.polycast.${cmd.id}`,
      name: cmd.title,
      "popclip version": 4050,
      ...(cmd.icon ? { icon: cmd.icon } : {}),
      description: cmd.description,
      actions: [action],
    };

    return [
      {
        path: `${cmd.id}.popclipext/Config.json`,
        contents: `${JSON.stringify(config, null, 2)}\n`,
      },
      {
        path: `${cmd.id}.popclipext/script.sh`,
        contents: popclipScriptShim(cmd),
        mode: 0o755,
      },
      {
        path: `${cmd.id}.popclipext/${OWNERSHIP_MARKER}`,
        contents: "polycast\n",
      },
    ];
  },

  validate(_cmd: CommandDef, files: readonly EmittedFile[]): ValidationIssue[] {
    const config = files.find((f) => f.path.endsWith("Config.json"));
    if (!config?.contents.includes('"stdin": "text"')) {
      return [
        { target: this.target, message: "Config.json missing stdin: text", severity: "error" },
      ];
    }
    if (!config.contents.includes('"identifier"')) {
      return [
        { target: this.target, message: "Config.json missing identifier", severity: "error" },
      ];
    }
    const script = files.find((f) => f.path.endsWith("script.sh"));
    if (!script?.contents.includes(" run --commands ")) {
      return [
        {
          target: this.target,
          message: "script.sh missing polycast run dispatcher stub",
          severity: "error",
        },
      ];
    }
    return [];
  },
};
