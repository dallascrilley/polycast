import { spawnSync } from "node:child_process";
import { readFileSync, writeSync } from "node:fs";
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

  // On a terminal, capture stdout so a body whose output lacks a trailing
  // newline (`tr`, `printf`, …) cannot leave the shell prompt mid-line. When
  // stdout is a pipe or file the bytes are inherited untouched, so launcher
  // shims and scripted callers see exactly what the body wrote.
  const captureStdout = process.stdout.isTTY === true;

  const result = spawnSync("bash", ["-c", scriptBody(cmd), "polycast-run", ...positional], {
    input: stdin,
    stdio: [
      stdin !== undefined ? "pipe" : "inherit",
      captureStdout ? "pipe" : "inherit",
      "inherit",
    ],
  });

  if (result.error) throw result.error;

  const out: Uint8Array | null = captureStdout ? result.stdout : null;
  if (out && out.length > 0) {
    // writeSync, not process.stdout.write: the CLI exits via process.exit and
    // an async write to a pipe can be dropped.
    writeSync(1, out);
    if (needsTrailingNewline(out)) writeSync(1, "\n");
  }

  return result.status ?? 1;
}

const LF = 0x0a;

/** True when captured output is non-empty and does not already end in "\n". */
export function needsTrailingNewline(out: Uint8Array): boolean {
  return out.length > 0 && out[out.length - 1] !== LF;
}
