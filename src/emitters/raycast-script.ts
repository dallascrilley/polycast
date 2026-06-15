import type { CommandArg, CommandDef, EmittedFile, Emitter, ValidationIssue } from "../types.ts";

const SHEBANG: Record<CommandDef["body"]["lang"], string> = {
  bash: "#!/bin/bash",
  node: "#!/usr/bin/env node",
  applescript: "#!/usr/bin/osascript",
};

function argumentJson(arg: CommandArg, index: number): string {
  const spec: Record<string, unknown> = {
    type: arg.type ?? "text",
    placeholder: arg.placeholder ?? arg.name,
    optional: arg.optional ?? false,
  };
  if (arg.percentEncoded) spec.percentEncoded = true;
  if (arg.type === "dropdown" && arg.data) spec.data = arg.data;
  return `# @raycast.argument${index + 1} ${JSON.stringify(spec)}`;
}

export const raycastScript: Emitter = {
  target: "raycast-script",
  supports: ["args", "none"],

  emit(cmd: CommandDef): EmittedFile[] {
    if (!this.supports.includes(cmd.modality)) return [];

    const lines: string[] = [
      SHEBANG[cmd.body.lang],
      "",
      "# Required parameters:",
      "# @raycast.schemaVersion 1",
      `# @raycast.title ${cmd.title}`,
      `# @raycast.mode ${cmd.x?.raycast?.mode ?? "fullOutput"}`,
      "",
      "# Optional parameters:",
    ];

    if (cmd.icon) lines.push(`# @raycast.icon ${cmd.icon}`);
    if (cmd.x?.raycast?.iconDark) lines.push(`# @raycast.iconDark ${cmd.x.raycast.iconDark}`);
    if (cmd.x?.raycast?.packageName) {
      lines.push(`# @raycast.packageName ${cmd.x.raycast.packageName}`);
    }
    if (cmd.x?.raycast?.needsConfirmation) lines.push("# @raycast.needsConfirmation true");
    if (cmd.x?.raycast?.currentDirectoryPath) {
      lines.push(`# @raycast.currentDirectoryPath ${cmd.x.raycast.currentDirectoryPath}`);
    }
    if (cmd.x?.raycast?.refreshTime) {
      lines.push(`# @raycast.refreshTime ${cmd.x.raycast.refreshTime}`);
    }
    cmd.args?.forEach((arg, i) => lines.push(argumentJson(arg, i)));

    lines.push("", "# Documentation:", `# @raycast.description ${cmd.description}`);
    if (cmd.author) lines.push(`# @raycast.author ${cmd.author}`);

    lines.push("", cmd.body.source.trimEnd(), "");

    return [{ path: `${cmd.id}.sh`, contents: lines.join("\n"), mode: 0o755 }];
  },

  validate(cmd: CommandDef, files: readonly EmittedFile[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const file = files[0];
    if (!file) {
      issues.push({ target: this.target, message: "no output file", severity: "error" });
      return issues;
    }
    for (const needle of ["@raycast.schemaVersion 1", "@raycast.title", "@raycast.mode"]) {
      if (!file.contents.includes(needle)) {
        issues.push({ target: this.target, message: `missing ${needle}`, severity: "error" });
      }
    }
    if (cmd.modality === "args" && !file.contents.includes("@raycast.argument1")) {
      issues.push({
        target: this.target,
        message: "args command missing @raycast.argument1",
        severity: "error",
      });
    }
    return issues;
  },
};
