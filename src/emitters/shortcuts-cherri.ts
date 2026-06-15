import type { CommandDef, EmittedFile, Emitter, ValidationIssue } from "../types.ts";
import { escapeCherriString } from "../wrappers.ts";

export const shortcutsCherri: Emitter = {
  target: "shortcuts-cherri",
  supports: ["text", "none"],

  emit(cmd: CommandDef): EmittedFile[] {
    if (!this.supports.includes(cmd.modality)) return [];

    const name = cmd.x?.shortcuts?.name ?? cmd.title;
    const lines: string[] = [`#define name "${name.replace(/"/g, '\\"')}"`];

    if (cmd.x?.shortcuts?.color) lines.push(`#define color ${cmd.x.shortcuts.color}`);
    if (cmd.x?.shortcuts?.glyph) lines.push(`#define glyph ${cmd.x.shortcuts.glyph}`);
    if (cmd.x?.shortcuts?.from) lines.push(`#define from ${cmd.x.shortcuts.from}`);
    if (cmd.modality === "text") lines.push("#define inputs text");

    lines.push("#include 'actions/mac'");

    const body = escapeCherriString(cmd.body.source.trimEnd());
    const inputArg = cmd.modality === "text" ? "ShortcutInput" : "nil";
    lines.push(`runShellScript('${body}', ${inputArg}, '/bin/bash')`, "");

    return [
      { path: `${cmd.id}.cherri`, contents: lines.join("\n") },
      { path: `${cmd.id}.polycast-owned`, contents: "polycast\n" },
    ];
  },

  validate(_cmd: CommandDef, files: readonly EmittedFile[]): ValidationIssue[] {
    const cherri = files.find((f) => f.path.endsWith(".cherri"));
    if (!cherri) {
      return [{ target: this.target, message: "missing .cherri file", severity: "error" }];
    }
    if (!cherri.contents.includes("runShellScript")) {
      return [{ target: this.target, message: "cherri missing runShellScript", severity: "error" }];
    }
    return [];
  },
};
