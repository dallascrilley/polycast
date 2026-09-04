import { OWNERSHIP_MARKER } from "../constants.ts";
import {
  shortcutsArgsShim,
  shortcutsFilesShim,
  shortcutsNoneShim,
  shortcutsTextShim,
} from "../shim.ts";
import type { CommandArg, CommandDef, EmittedFile, Emitter, ValidationIssue } from "../types.ts";
import { escapeCherriString } from "../wrappers.ts";

const SHORTCUT_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "lightblue",
  "blue",
  "violet",
  "purple",
  "pink",
] as const;

const SHORTCUT_GLYPHS: readonly [readonly string[], string][] = [
  [["agent", "assistant", "bot", "ai"], "magicWand"],
  [["send", "share", "upload", "publish"], "rocket"],
  [["review", "check", "verify", "test"], "star"],
  [["file", "folder", "repo", "vault"], "folder"],
  [["search", "find", "lookup"], "star"],
  [["open", "launch", "start"], "rocket"],
  [["save", "download", "archive"], "folder"],
  [["copy", "clipboard"], "gear"],
  [["message", "text", "note"], "magicWand"],
];

const DEFAULT_SHORTCUT_GLYPHS = ["star", "gear", "magicWand", "rocket"] as const;
const LOWERCASE_TITLE_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
]);

function cherriPromptType(arg: CommandArg): "Text" | "Number" {
  return arg.type === "password" ? "Text" : "Text";
}

/** A `#define` value is the rest of the line, unquoted: collapse to one line. */
function cherriDefineValue(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function stableIndex(value: string, length: number): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function stableChoice<Item>(value: string, choices: readonly [Item, ...Item[]]): Item {
  const target = stableIndex(value, choices.length);
  let selected = choices[0];
  for (const [index, choice] of choices.entries()) {
    if (index === target) selected = choice;
  }
  return selected;
}

function titleFromId(id: string): string {
  return id
    .split("-")
    .map((word, index) =>
      index > 0 && LOWERCASE_TITLE_WORDS.has(word)
        ? word
        : `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`,
    )
    .join(" ");
}

function defaultShortcutGlyph(cmd: CommandDef): string {
  const words = `${cmd.id} ${cmd.title}`.toLowerCase().split(/[^a-z0-9]+/);
  const semanticGlyph = SHORTCUT_GLYPHS.find(([keywords]) =>
    keywords.some((keyword) => words.includes(keyword)),
  );
  if (semanticGlyph) return semanticGlyph[1];
  return stableChoice(cmd.id, DEFAULT_SHORTCUT_GLYPHS);
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

function defaultInputs(cmd: CommandDef): readonly string[] {
  if (cmd.x?.shortcuts?.inputs) return cmd.x.shortcuts.inputs;
  if (cmd.modality === "text") return ["text"];
  if (cmd.modality === "files") return ["file"];
  return [];
}

function shellShimFor(cmd: CommandDef): string {
  switch (cmd.modality) {
    case "text":
      return shortcutsTextShim(cmd);
    case "none":
      return shortcutsNoneShim(cmd);
    case "files":
      return shortcutsFilesShim(cmd);
    case "args":
      return shortcutsArgsShim(cmd);
  }
}

function runShellScriptLine(cmd: CommandDef): string {
  const script = escapeCherriString(shellShimFor(cmd));
  if (cmd.modality === "files") {
    return `runShellScript('${script}', ShortcutInput, '/bin/bash', 'as arguments')`;
  }
  const inputArg = cmd.modality === "text" ? "ShortcutInput" : "nil";
  return `runShellScript('${script}', ${inputArg}, '/bin/bash')`;
}

export const shortcutsCherri: Emitter = {
  target: "shortcuts-cherri",
  supports: ["text", "none", "args", "files"],

  emit(cmd: CommandDef): EmittedFile[] {
    if (!this.supports.includes(cmd.modality)) return [];
    if (!argsSupported(cmd)) return [];

    // Cherri `#define name` takes the rest of the line verbatim: quoting it
    // makes the quotes part of the shortcut name *and* of the compiled
    // `<name>.shortcut` filename. Pass the raw name, collapsed to one line.
    const name = cherriDefineValue(cmd.x?.shortcuts?.name ?? titleFromId(cmd.id));
    const lines: string[] = [`#define name ${name}`];

    lines.push(`#define color ${cmd.x?.shortcuts?.color ?? stableChoice(cmd.id, SHORTCUT_COLORS)}`);
    lines.push(`#define glyph ${cmd.x?.shortcuts?.glyph ?? defaultShortcutGlyph(cmd)}`);
    if (cmd.x?.shortcuts?.from) lines.push(`#define from ${cmd.x.shortcuts.from}`);
    const inputs = defaultInputs(cmd);
    if (inputs.length > 0) lines.push(`#define inputs ${inputs.join(", ")}`);

    lines.push("#include 'actions/mac'");

    if (cmd.modality === "args") {
      lines.push(...emitArgsCherri(cmd));
    } else {
      lines.push(runShellScriptLine(cmd), "");
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
    if (cmd.modality === "files") {
      if (!cherri.contents.includes("'as arguments'")) {
        issues.push({
          target: this.target,
          message: "files cherri must pass ShortcutInput as arguments, not stdin",
          severity: "error",
        });
      }
      if (cherri.contents.includes(" --text ")) {
        issues.push({
          target: this.target,
          message: "files cherri must not coerce paths through --text",
          severity: "error",
        });
      }
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
