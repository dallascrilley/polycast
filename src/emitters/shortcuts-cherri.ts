import type { CommandArg, CommandDef, EmittedFile, Emitter, ValidationIssue } from "../types.ts";
import { escapeCherriString } from "../wrappers.ts";

function cherriPromptType(arg: CommandArg): "Text" | "Number" {
  return arg.type === "password" ? "Text" : "Text";
}

function argsSupported(cmd: CommandDef): boolean {
  if (cmd.modality !== "args") return true;
  const args = cmd.args ?? [];
  if (args.length === 0) return false;
  return !args.some((a) => a.type === "dropdown");
}

function emitArgsCherri(cmd: CommandDef): string[] {
  const args = cmd.args ?? [];
  const lines: string[] = [];

  for (const [i, arg] of args.entries()) {
    const varName = `polycast_arg_${i + 1}`;
    const prompt = (arg.placeholder ?? arg.name).replace(/"/g, '\\"');
    const inputType = cherriPromptType(arg);
    lines.push(`@${varName} = prompt("${prompt}", "${inputType}", "")`);
  }

  const setLine = `set -- ${args.map((_, i) => `"{@polycast_arg_${i + 1}}"`).join(" ")}`;
  const script = ["set -euo pipefail", setLine, cmd.body.source.trimEnd()].join("\n");
  lines.push(`runShellScript('${escapeCherriString(script)}', nil, '/bin/bash')`, "");

  return lines;
}

export const shortcutsCherri: Emitter = {
  target: "shortcuts-cherri",
  supports: ["text", "none", "args"],

  emit(cmd: CommandDef): EmittedFile[] {
    if (!this.supports.includes(cmd.modality)) return [];
    if (!argsSupported(cmd)) return [];

    const name = cmd.x?.shortcuts?.name ?? cmd.title;
    const lines: string[] = [`#define name "${name.replace(/"/g, '\\"')}"`];

    if (cmd.x?.shortcuts?.color) lines.push(`#define color ${cmd.x.shortcuts.color}`);
    if (cmd.x?.shortcuts?.glyph) lines.push(`#define glyph ${cmd.x.shortcuts.glyph}`);
    if (cmd.x?.shortcuts?.from) lines.push(`#define from ${cmd.x.shortcuts.from}`);
    if (cmd.modality === "text") lines.push("#define inputs text");

    lines.push("#include 'actions/mac'");

    if (cmd.modality === "args") {
      lines.push(...emitArgsCherri(cmd));
    } else {
      const body = escapeCherriString(cmd.body.source.trimEnd());
      const inputArg = cmd.modality === "text" ? "ShortcutInput" : "nil";
      lines.push(`runShellScript('${body}', ${inputArg}, '/bin/bash')`, "");
    }

    return [
      { path: `${cmd.id}.cherri`, contents: lines.join("\n") },
      { path: `${cmd.id}.polycast-owned`, contents: "polycast\n" },
    ];
  },

  validate(cmd: CommandDef, files: readonly EmittedFile[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const cherri = files.find((f) => f.path.endsWith(".cherri"));
    if (!cherri) {
      return [{ target: this.target, message: "missing .cherri file", severity: "error" }];
    }
    if (!cherri.contents.includes("runShellScript")) {
      issues.push({
        target: this.target,
        message: "cherri missing runShellScript",
        severity: "error",
      });
    }
    if (cmd.modality === "args") {
      if (!cmd.args?.length) {
        issues.push({
          target: this.target,
          message: "args modality requires cmd.args",
          severity: "error",
        });
      } else if (cmd.args.some((a) => a.type === "dropdown")) {
        issues.push({
          target: this.target,
          message: "dropdown args unsupported for Shortcuts (use text args or Raycast)",
          severity: "warning",
        });
      } else if (!cherri.contents.includes("prompt(")) {
        issues.push({
          target: this.target,
          message: "args cherri missing prompt()",
          severity: "error",
        });
      } else if (!cherri.contents.includes("set --")) {
        issues.push({
          target: this.target,
          message: "args cherri missing positional set --",
          severity: "error",
        });
      }
    }
    return issues;
  },
};
