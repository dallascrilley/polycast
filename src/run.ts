import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { CommandDef } from "./types.ts";
import { wrappedScript } from "./wrappers.ts";

export interface RunOptions {
  readonly argv: readonly string[];
  readonly text?: string;
}

function usageLines(cmd: CommandDef): string[] {
  const lines = [cmd.title, "", cmd.description, ""];
  if (cmd.modality === "text") lines.push("Usage: read selection from stdin or pass --text");
  if (cmd.modality === "files") lines.push("Usage: pass file paths as arguments");
  if (cmd.modality === "args" && cmd.args) {
    lines.push(`Usage: ${cmd.args.map((a) => `<${a.name}>`).join(" ")}`);
  }
  return lines;
}

function scriptBody(cmd: CommandDef): string {
  return wrappedScript(cmd).replace(/^#![^\n]*\n/, "");
}

export function printCommandUsage(cmd: CommandDef): void {
  console.log(usageLines(cmd).join("\n"));
}

/** Run a command body with modality-appropriate stdin/argv wiring. */
export function executeCommand(cmd: CommandDef, options: RunOptions): number {
  const helpIdx = options.argv.findIndex((a) => a === "-h" || a === "--help");
  if (helpIdx >= 0) {
    printCommandUsage(cmd);
    return 0;
  }

  const positional = options.argv.filter((a) => a !== "--");
  let stdin: string | undefined;

  if (cmd.modality === "text") {
    let text = options.text ?? "";
    let i = 0;
    while (i < positional.length) {
      if (positional[i] === "--text") {
        text = positional[i + 1] ?? "";
        i += 2;
        continue;
      }
      i++;
    }
    if (!text && !process.stdin.isTTY) {
      text = readFileSync(0, "utf8");
    }
    stdin = text;
  }

  const result = spawnSync("bash", ["-c", scriptBody(cmd), "polycast-run", ...positional], {
    input: stdin,
    encoding: "utf8",
    stdio: [stdin !== undefined ? "pipe" : "inherit", "inherit", "inherit"],
  });

  if (result.error) throw result.error;
  return result.status ?? 1;
}
