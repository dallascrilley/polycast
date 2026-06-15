import { OWNERSHIP_MARKER, POLYCAST_VERSION } from "../constants.ts";
import type { CommandDef, EmittedFile, Emitter, ValidationIssue } from "../types.ts";

function usageBlock(cmd: CommandDef): string {
  const lines = [`${cmd.title}`, "", cmd.description, ""];
  if (cmd.modality === "text") lines.push("Usage: read selection from stdin or pass --text");
  if (cmd.modality === "files") lines.push("Usage: pass file paths as arguments");
  if (cmd.modality === "args" && cmd.args) {
    lines.push(`Usage: ${cmd.args.map((a) => `<${a.name}>`).join(" ")}`);
  }
  return lines.join("\n");
}

function agentCliSource(cmd: CommandDef): string {
  const shebang = "#!/usr/bin/env bash";
  const help = usageBlock(cmd).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const argParse =
    cmd.modality === "args" && cmd.args
      ? cmd.args
          .map((a, i) => {
            const n = i + 1;
            return `  ${a.name}="$${n}"`;
          })
          .join("\n")
      : "";

  const textInput =
    cmd.modality === "text"
      ? [
          'TEXT=""',
          "while [ $# -gt 0 ]; do",
          '  case "$1" in',
          '    --text) TEXT="$2"; shift 2 ;;',
          '    -h|--help) echo "' + help + '"; exit 0 ;;',
          "    *) shift ;;",
          "  esac",
          "done",
          'if [ -z "$TEXT" ] && [ ! -t 0 ]; then TEXT="$(cat)"; fi',
          'export POLYCAST_TEXT="$TEXT"',
          'printf %s "$TEXT" | {',
          cmd.body.source.trimEnd(),
          "}",
        ].join("\n")
      : "";

  const filesBody =
    cmd.modality === "files"
      ? [
          'case "$1" in',
          '  -h|--help) echo "' + help + '"; exit 0 ;;',
          "esac",
          cmd.body.source.trimEnd(),
        ].join("\n")
      : "";

  const noneBody =
    cmd.modality === "none"
      ? [
          'case "$1" in',
          '  -h|--help) echo "' + help + '"; exit 0 ;;',
          "esac",
          cmd.body.source.trimEnd(),
        ].join("\n")
      : "";

  const argsBody =
    cmd.modality === "args"
      ? [
          'case "$1" in',
          '  -h|--help) echo "' + help + '"; exit 0 ;;',
          "esac",
          argParse,
          cmd.body.source.trimEnd(),
        ].join("\n")
      : "";

  const body = textInput || filesBody || noneBody || argsBody;

  return [shebang, "set -euo pipefail", body, ""].join("\n");
}

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
    };

    return [
      { path: cmd.id, contents: agentCliSource(cmd), mode: 0o755 },
      { path: `${cmd.id}.polycast-meta.json`, contents: `${JSON.stringify(meta, null, 2)}\n` },
      { path: `${cmd.id}${OWNERSHIP_MARKER}`, contents: "polycast\n" },
    ];
  },

  validate(cmd: CommandDef, files: readonly EmittedFile[]): ValidationIssue[] {
    const bin = files.find((f) => f.path === cmd.id);
    if (!bin?.contents.startsWith("#!")) {
      return [{ target: this.target, message: "missing executable shebang", severity: "error" }];
    }
    const meta = files.find((f) => f.path.endsWith(".polycast-meta.json"));
    if (!meta?.contents.includes(`"id": "${cmd.id}"`)) {
      return [{ target: this.target, message: "missing meta sidecar", severity: "error" }];
    }
    return [];
  },
};
