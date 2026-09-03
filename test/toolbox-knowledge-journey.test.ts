import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatRunResult, runArguments } from "../raycast-extension/src/lib/run.ts";
import { filterRaycastCommands, parseStoredCommand } from "../raycast-extension/src/lib/store.ts";
import { writeCommandsJson } from "../src/commands-store.ts";
import { emitCommand } from "../src/registry.ts";
import { resolveToolboxExecutable } from "../src/toolbox-adapter.ts";
import { KNOWLEDGE_PROOF_QUERY, knowledgeCommand } from "./fixtures/toolbox-knowledge-command.ts";

function canonicalToolboxPath(): string | undefined {
  try {
    return resolveToolboxExecutable();
  } catch {
    return undefined;
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function writePolycastShim(root: string): Promise<string> {
  const shim = join(root, "polycast");
  await writeFile(
    shim,
    [
      "#!/bin/sh",
      `exec ${shellQuote(process.execPath)} run ${shellQuote(join(process.cwd(), "src/cli.ts"))} "$@"`,
      "",
    ].join("\n"),
  );
  await chmod(shim, 0o755);
  return shim;
}

test.skipIf(!canonicalToolboxPath())(
  "preserves Knowledge results and failures through the Raycast console and agent-cli",
  async () => {
    const toolbox = canonicalToolboxPath();
    if (!toolbox) throw new Error("canonical Toolbox executable is unavailable");

    const root = await mkdtemp(join(tmpdir(), "polycast-knowledge-journey-"));
    const commandsDir = join(root, "commands");
    const agentDir = join(root, "agent-cli");
    const polycastBin = await writePolycastShim(root);
    const command = knowledgeCommand(toolbox);
    const env = {
      ...process.env,
      POLYCAST_BIN: polycastBin,
      POLYCAST_COMMANDS_DIR: commandsDir,
    };

    try {
      expect(command.delegation).toEqual({
        kind: "toolbox",
        contract: "toolbox-polycast-adapter/v1",
        effectClass: "inspect",
        output: "canonical",
      });
      expect(command.body).toEqual({
        lang: "exec",
        executable: toolbox,
        args: ["knowledge", "--json", "search"],
      });

      const outputs = emitCommand(command, ["raycast-script", "agent-cli"]);
      expect(outputs.map((output) => output.target)).toEqual(["raycast-script", "agent-cli"]);
      expect(outputs.every((output) => !output.skipped)).toBe(true);
      const agentOutput = outputs.find((output) => output.target === "agent-cli");
      if (!agentOutput || agentOutput.skipped)
        throw new Error("agent-cli artifact was not emitted");

      await writeCommandsJson([command], commandsDir);
      await mkdir(agentDir, { recursive: true });
      for (const file of agentOutput.files) {
        const destination = join(agentDir, file.path);
        await writeFile(destination, file.contents);
        if (file.mode) await chmod(destination, file.mode);
      }

      const stored = parseStoredCommand(JSON.stringify(command));
      if (!stored) throw new Error("Knowledge command did not parse from the command store");
      expect(filterRaycastCommands([stored])).toEqual([stored]);

      const raycast = spawnSync(
        polycastBin,
        runArguments(stored, commandsDir, [KNOWLEDGE_PROOF_QUERY]),
        {
          cwd: process.cwd(),
          env,
          encoding: "utf8",
        },
      );
      const agent = spawnSync(join(agentDir, command.id), [KNOWLEDGE_PROOF_QUERY], {
        cwd: process.cwd(),
        env,
        encoding: "utf8",
      });

      expect(raycast.status).toBe(0);
      expect(agent.status).toBe(0);
      expect(agent.stdout).toBe(raycast.stdout);
      expect(agent.stderr).toBe(raycast.stderr);
      expect(JSON.parse(raycast.stdout)).toEqual([]);
      expect(raycast.stdout).toBe("[]\n");
      expect(raycast.stderr).toBe("");

      const invalidOption = "--wks-1529-invalid-option";
      const raycastFailure = spawnSync(
        polycastBin,
        runArguments(stored, commandsDir, [invalidOption]),
        {
          cwd: process.cwd(),
          env,
          encoding: "utf8",
        },
      );
      const agentFailure = spawnSync(join(agentDir, command.id), [invalidOption], {
        cwd: process.cwd(),
        env,
        encoding: "utf8",
      });

      expect(raycastFailure.status).toBe(2);
      expect(agentFailure.status).toBe(raycastFailure.status);
      expect(agentFailure.stdout).toBe(raycastFailure.stdout);
      expect(agentFailure.stderr).toBe(raycastFailure.stderr);
      expect(raycastFailure.stdout).toBe("");
      expect(raycastFailure.stderr).toContain(
        `knowledge: error: unrecognized arguments: ${invalidOption}`,
      );
      expect(formatRunResult(raycastFailure.stderr, raycastFailure.status)).toContain(
        "### Failed (exit code 2)",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
