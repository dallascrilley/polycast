import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isToolboxCommand } from "./toolbox-adapter.ts";
import type { CommandDef, ExecBody } from "./types.ts";
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

function bashScriptBody(cmd: CommandDef): string {
  return wrappedScript(cmd).replace(/^#![^\n]*\n/, "");
}

function spawnWithStdio(
  command: string,
  args: readonly string[],
  stdin: string | undefined,
  captureStdout: boolean,
) {
  return spawnSync(command, args, {
    input: stdin,
    stdio: [
      stdin !== undefined ? "pipe" : "inherit",
      captureStdout ? "pipe" : "inherit",
      "inherit",
    ],
  });
}

function spawnExec(
  body: ExecBody,
  positional: readonly string[],
  stdin: string | undefined,
  captureStdout: boolean,
) {
  const extra = body.args ?? [];
  const executable = body.executable;
  if (executable.endsWith(".ts") || executable.endsWith(".js") || executable.endsWith(".mjs")) {
    return spawnWithStdio(
      process.execPath,
      [executable, ...extra, ...positional],
      stdin,
      captureStdout,
    );
  }
  return spawnWithStdio(executable, [...extra, ...positional], stdin, captureStdout);
}

function spawnInterpreter(
  cmd: CommandDef,
  positional: readonly string[],
  stdin: string | undefined,
  captureStdout: boolean,
) {
  if (cmd.body.lang === "exec") {
    return spawnExec(cmd.body, positional, stdin, captureStdout);
  }
  switch (cmd.body.lang) {
    case "bash":
      return spawnWithStdio(
        "bash",
        ["-c", bashScriptBody(cmd), "polycast-run", ...positional],
        stdin,
        captureStdout,
      );
    case "node":
      return spawnWithStdio(
        "node",
        ["-e", cmd.body.source.trimEnd(), "polycast-run", ...positional],
        stdin,
        captureStdout,
      );
    case "applescript": {
      // osascript has no end-of-options marker. A temporary program file lets
      // an argv value beginning with `-` remain an AppleScript argument.
      const tempDir = mkdtempSync(join(tmpdir(), "polycast-osascript-"));
      const scriptPath = join(tempDir, "body.applescript");
      try {
        writeFileSync(scriptPath, cmd.body.source.trimEnd());
        return spawnWithStdio("osascript", [scriptPath, ...positional], stdin, captureStdout);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
    default: {
      const exhaustive: never = cmd.body;
      return exhaustive;
    }
  }
}

export function printCommandUsage(cmd: CommandDef): void {
  console.log(usageLines(cmd).join("\n"));
}

/** Run a command body with modality-appropriate stdin/argv wiring. */
export function executeCommand(cmd: CommandDef, options: RunOptions): number {
  if (cmd.body.lang !== "exec") {
    const helpIdx = options.argv.findIndex((a) => a === "-h" || a === "--help");
    if (helpIdx >= 0) {
      printCommandUsage(cmd);
      return 0;
    }
  }

  // The CLI parser consumes its own separator before invoking this function.
  // Every remaining value belongs to the body, including literal control-like
  // arguments such as "--" and "--text".
  const positional = options.argv;
  let stdin: string | undefined = options.text;

  if (cmd.modality === "text") {
    stdin ??= "";
    if (!stdin && !process.stdin.isTTY) {
      stdin = readFileSync(0, "utf8");
    }
  }

  // On a terminal, capture stdout so a body whose output lacks a trailing
  // newline (`tr`, `printf`, …) cannot leave the shell prompt mid-line. When
  // stdout is a pipe or file the bytes are inherited untouched, so launcher
  // shims and scripted callers see exactly what the body wrote.
  const captureStdout = process.stdout.isTTY === true;

  const result = spawnInterpreter(cmd, positional, stdin, captureStdout);

  if (result.error) throw result.error;

  const out: Uint8Array | null = captureStdout ? result.stdout : null;
  if (out && out.length > 0) {
    // writeSync, not process.stdout.write: the CLI exits via process.exit and
    // an async write to a pipe can be dropped.
    writeSync(1, out);
    // Canonical exec bodies own their output bytes. In particular, do not
    // append a newline that could corrupt a Toolbox result or receipt link.
    if (!isToolboxCommand(cmd) && needsTrailingNewline(out)) {
      writeSync(1, "\n");
    }
  }

  return result.status ?? 1;
}

const LF = 0x0a;

/** True when captured output is non-empty and does not already end in "\n". */
export function needsTrailingNewline(out: Uint8Array): boolean {
  return out.length > 0 && out[out.length - 1] !== LF;
}
