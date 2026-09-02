import type { ConsoleProfile } from "../console-profiles.ts";
import { loadConsoleProfile } from "../console-profiles.ts";
import { OWNERSHIP_MARKER } from "../constants.ts";
import { loadCapturedAction } from "../native-action-capture.ts";
import { MissingPrivateConfig } from "../private-config.ts";
import {
  shortcutsArgsShim,
  shortcutsFilesShim,
  shortcutsNoneShim,
  shortcutsTextShim,
} from "../shim.ts";
import type {
  CommandArg,
  CommandDef,
  EmittedFile,
  Emitter,
  ShortcutWorkflowStep,
  ValidationIssue,
} from "../types.ts";
import { escapeCherriDoubleQuoted, escapeCherriString } from "../wrappers.ts";

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

/** Serialize a decompiled `rawAction` parameter value as a Cherri literal. */
function cherriLiteral(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return `"${escapeCherriDoubleQuoted(value)}"`;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.map(cherriLiteral).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, entryValue]) => `"${escapeCherriDoubleQuoted(key)}": ${cherriLiteral(entryValue)}`,
    );
    return `{${entries.join(", ")}}`;
  }
  throw new Error(`unsupported rawAction literal value: ${JSON.stringify(value)}`);
}

/**
 * Blink Shell's documented X-Callback-URL scheme: a fixed command against a
 * host already saved in Blink's own on-device Hosts configuration. Neither
 * the profile name nor `blinkKey`/`hostAlias` are SSH credentials — Blink
 * owns the actual key material.
 */
function blinkCallbackUrl(profile: ConsoleProfile): string {
  const cmd = encodeURIComponent(`mosh ${profile.hostAlias}`);
  const key = encodeURIComponent(profile.blinkKey);
  return `blinkshell://run?key=${key}&cmd=${cmd}`;
}

function emitWorkflowStep(step: ShortcutWorkflowStep): string[] {
  switch (step.kind) {
    case "require-reachable":
      // A private `.ts.net` route only resolves and responds when Tailscale
      // is connected, so a failed request halts the Shortcut with iOS's
      // native error UI before any private route opens.
      return [`downloadURL("${escapeCherriDoubleQuoted(step.url)}")`, ""];
    case "open-url":
      return [`openURL("${escapeCherriDoubleQuoted(step.url)}")`, ""];
    case "open-console":
      return [
        `openURL("${escapeCherriDoubleQuoted(blinkCallbackUrl(loadConsoleProfile(step.profile)))}")`,
        "",
      ];
    case "native-capture": {
      const action = loadCapturedAction(step.capture);
      return [
        `rawAction("${escapeCherriDoubleQuoted(action.identifier)}", ${cherriLiteral(action.params)})`,
        "",
      ];
    }
  }
}

/**
 * A bounded native workflow replaces the shell dispatcher entirely: every
 * step is a standard, documented Cherri action (`downloadURL`, `openURL`,
 * `rawAction`), never `runShellScript`. See `ShortcutWorkflowStep` in
 * `types.ts` for the security rationale of each step kind.
 */
function emitWorkflowCherri(cmd: CommandDef, workflow: readonly ShortcutWorkflowStep[]): string[] {
  const lines: string[] = ["#include 'actions/web'"];
  if (cmd.modality === "text" || cmd.modality === "files") {
    lines.push("@shortcutInput = ShortcutInput", "");
  }
  for (const step of workflow) {
    lines.push(...emitWorkflowStep(step));
  }
  return lines;
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
    const name = cherriDefineValue(cmd.x?.shortcuts?.name ?? cmd.title);
    const lines: string[] = [`#define name ${name}`];

    if (cmd.x?.shortcuts?.color) lines.push(`#define color ${cmd.x.shortcuts.color}`);
    if (cmd.x?.shortcuts?.glyph) lines.push(`#define glyph ${cmd.x.shortcuts.glyph}`);
    if (cmd.x?.shortcuts?.from) lines.push(`#define from ${cmd.x.shortcuts.from}`);
    const inputs = defaultInputs(cmd);
    if (inputs.length > 0) lines.push(`#define inputs ${inputs.join(", ")}`);

    const workflow = cmd.x?.shortcuts?.workflow;
    if (workflow && workflow.length > 0) {
      let workflowLines: string[];
      try {
        workflowLines = emitWorkflowCherri(cmd, workflow);
      } catch (err) {
        // Blink console profiles and captured native actions are private,
        // un-committed, per-operator config. Not having captured one yet is
        // a legitimate build-environment state, not a build failure: skip
        // this command for this target instead of failing every command.
        if (err instanceof MissingPrivateConfig) return [];
        throw err;
      }
      lines.push(...workflowLines);
    } else {
      lines.push("#include 'actions/mac'");
      if (cmd.modality === "args") {
        lines.push(...emitArgsCherri(cmd));
      } else {
        lines.push(runShellScriptLine(cmd), "");
      }
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
    const nameLine = cherri.contents.split("\n").find((l) => l.startsWith("#define name "));
    if (nameLine && /^#define name\s+["']/.test(nameLine)) {
      issues.push({
        target: this.target,
        message: "quoted #define name — quotes land in the shortcut name and compiled filename",
        severity: "error",
      });
    }

    const workflow = cmd.x?.shortcuts?.workflow;
    if (workflow && workflow.length > 0) {
      if (cherri.contents.includes("runShellScript")) {
        issues.push({
          target: this.target,
          message: "native workflow must not fall back to the shell dispatcher",
          severity: "error",
        });
      }
      if (!cherri.contents.includes("#include 'actions/web'")) {
        issues.push({
          target: this.target,
          message: "native workflow missing web actions include",
          severity: "error",
        });
      }
      for (const step of workflow) {
        if (
          step.kind === "require-reachable" &&
          !cherri.contents.includes(`downloadURL("${escapeCherriDoubleQuoted(step.url)}")`)
        ) {
          issues.push({
            target: this.target,
            message: `native workflow missing reachability check for ${step.url}`,
            severity: "error",
          });
        }
        if (
          step.kind === "open-url" &&
          !cherri.contents.includes(`openURL("${escapeCherriDoubleQuoted(step.url)}")`)
        ) {
          issues.push({
            target: this.target,
            message: `native workflow missing openURL for ${step.url}`,
            severity: "error",
          });
        }
      }
      return issues;
    }

    if (!cherri.contents.includes("runShellScript")) {
      issues.push({
        target: this.target,
        message: "cherri missing runShellScript",
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
