import { OWNERSHIP_MARKER } from "../constants.ts";
import { shortcutsArgsShim, shortcutsNoneShim, shortcutsTextShim } from "../shim.ts";
import type { CommandArg, CommandDef, EmittedFile, Emitter, ValidationIssue } from "../types.ts";
import { escapeCherriString } from "../wrappers.ts";

function cherriPromptType(arg: CommandArg): "Text" | "Number" {
  return arg.type === "password" ? "Text" : "Text";
}

/** A `#define` value is the rest of the line, unquoted: collapse to one line. */
function cherriDefineValue(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
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

  lines.push(
    `runShellScript('${escapeCherriString(shortcutsArgsShim(cmd))}', nil, '/bin/bash')`,
    "",
  );

  return lines;
}

function shellShimFor(cmd: CommandDef): string {
  switch (cmd.modality) {
    case "text":
      return shortcutsTextShim(cmd);
    case "none":
      return shortcutsNoneShim(cmd);
    default:
      return shortcutsArgsShim(cmd);
  }
}

export const shortcutsCherri: Emitter = {
  target: "shortcuts-cherri",
  supports: ["text", "none", "args"],

  emit(cmd: CommandDef): EmittedFile[] {
    if (!this.supports.includes(cmd.modality)) return [];
    if (!argsSupported(cmd)) return [];

    // Cherri `#define name` takes the rest of the line verbatim: quoting it
    // makes the quotes part of the shortcut name *and* of the compiled
    // `<name>.shortcut` filename. Pass the raw name, collapsed to one line.
    const name = cherriDefineValue(cmd.x?.shortcuts?.name ?? cmd.title);
    const lines: string[] = [`#define name ${name}`];

    if (cmd.x?.shortcuts?.color) lines.push(`#define color ${cmd.x.shortcuts.color}`);
    if (cmd.x?.shortcuts?.glyph) lines.push(`#define glyph ${cmd.x.shortcuts.glyph}`);
    if (cmd.x?.shortcuts?.from) lines.push(`#define from ${cmd.x.shortcuts.from}`);
    const inputs = cmd.x?.shortcuts?.inputs ?? (cmd.modality === "text" ? ["text"] : []);
    if (inputs.length > 0) lines.push(`#define inputs ${inputs.join(", ")}`);

    lines.push("#include 'actions/mac'");

    if (cmd.modality === "args") {
      lines.push(...emitArgsCherri(cmd));
    } else {
      const inputArg = cmd.modality === "text" ? "ShortcutInput" : "nil";
      lines.push(
        `runShellScript('${escapeCherriString(shellShimFor(cmd))}', ${inputArg}, '/bin/bash')`,
        "",
      );
    }

    return [
      { path: `${cmd.id}.cherri`, contents: lines.join("\n") },
      { path: `${cmd.id}.cherri${OWNERSHIP_MARKER}`, contents: "polycast\n" },
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
    const nameLine = cherri.contents.split("\n").find((l) => l.startsWith("#define name "));
    if (nameLine && /^#define name\s+["']/.test(nameLine)) {
      issues.push({
        target: this.target,
        message: "quoted #define name — quotes land in the shortcut name and compiled filename",
        severity: "error",
      });
    }
    if (!cherri.contents.includes("run --commands")) {
      issues.push({
        target: this.target,
        message: "cherri missing polycast run dispatcher",
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
