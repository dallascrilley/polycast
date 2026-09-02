import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCommandJson, writeCommandsJson } from "../src/commands-store.ts";
import { parseCommandDefJson } from "../src/schema/command-def.ts";
import {
  defineToolboxCommand,
  isToolboxCommand,
  resolveToolboxExecutable,
} from "../src/toolbox-adapter.ts";

async function writeToolboxFixture(root: string): Promise<string> {
  const bin = join(root, "bin", "toolbox");
  await mkdir(join(root, "bin"));
  await writeFile(
    bin,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${TOOLBOX_READ_STDIN:-0}" == "1" ]]; then
  cat > "$TOOLBOX_STDIN"
fi
printf '%s\\0' "$@" > "$TOOLBOX_ARGV"
if [[ "\${3:-}" == "fail" ]]; then
  printf '%s\\n' '{"result":"failed","receipt":"toolbox://receipt/failure"}'
  printf '%s\\n' 'canonical failure' >&2
  exit 17
fi
printf '%s\\n' '{"result":"canonical","receipt":"toolbox://receipt/success"}'
printf '%s\\n' 'canonical warning' >&2
`,
  );
  await chmod(bin, 0o755);
  return bin;
}

function run(commandDir: string, id: string, argv: readonly string[], env: NodeJS.ProcessEnv) {
  return spawnSync(
    "bun",
    ["run", "src/cli.ts", "run", id, "--commands", commandDir, "--", ...argv],
    { cwd: process.cwd(), env },
  );
}

function runText(
  commandDir: string,
  id: string,
  text: string,
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
) {
  return spawnSync(
    "bun",
    ["run", "src/cli.ts", "run", id, "--commands", commandDir, "--text", text, "--", ...argv],
    { cwd: process.cwd(), env },
  );
}

describe("Toolbox adapter dispatch", () => {
  test("passes canonical results, receipts, diagnostics, status, and argv through unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-toolbox-adapter-"));
    const commands = join(root, "commands");
    const toolbox = await writeToolboxFixture(root);
    const resolvedToolbox = resolveToolboxExecutable(toolbox);
    const argvCapture = join(root, "argv");
    const stdinCapture = join(root, "stdin");
    const command = defineToolboxCommand({
      id: "toolbox-fixture",
      title: "Toolbox fixture",
      description: "delegates to a temporary canonical executable",
      executable: resolvedToolbox,
      fixedArgv: ["knowledge", "search"],
      modality: "args",
      args: [{ name: "query" }],
      effectClass: "inspect",
      output: "canonical",
    });
    const textCommand = defineToolboxCommand({
      id: "toolbox-text-fixture",
      title: "Toolbox text fixture",
      description: "delegates text through stdin",
      executable: resolvedToolbox,
      fixedArgv: ["knowledge", "search"],
      modality: "text",
      args: [],
      effectClass: "inspect",
      output: "canonical",
    });

    try {
      expect(command.body).toEqual({
        lang: "exec",
        executable: resolvedToolbox,
        args: ["knowledge", "search"],
      });
      expect(command.delegation).toEqual({
        kind: "toolbox",
        contract: "toolbox-polycast-adapter/v1",
        effectClass: "inspect",
        output: "canonical",
      });
      expect(command.x).toBeUndefined();
      expect(isToolboxCommand(command)).toBe(true);
      await writeCommandsJson([command, textCommand], commands);
      expect((await loadCommandJson(command.id, commands)).delegation).toEqual(command.delegation);

      const env = { ...process.env, TOOLBOX_ARGV: argvCapture, TOOLBOX_STDIN: stdinCapture };
      const success = run(commands, command.id, ["literal query", "$(not-a-command)", "--"], env);
      expect(success.status).toBe(0);
      expect(success.stdout).toEqual(
        Buffer.from('{"result":"canonical","receipt":"toolbox://receipt/success"}\n'),
      );
      expect(success.stderr).toEqual(Buffer.from("canonical warning\n"));
      expect(await readFile(argvCapture)).toEqual(
        Buffer.from("knowledge\0search\0literal query\0$(not-a-command)\0--\0"),
      );

      const text = runText(commands, textCommand.id, "selected text", ["--text", "literal"], {
        ...env,
        TOOLBOX_READ_STDIN: "1",
      });
      expect(text.status).toBe(0);
      expect(await readFile(argvCapture)).toEqual(
        Buffer.from("knowledge\0search\0--text\0literal\0"),
      );
      expect(await readFile(stdinCapture, "utf8")).toBe("selected text");

      const failure = run(commands, command.id, ["fail"], env);
      expect(failure.status).toBe(17);
      expect(failure.stdout).toEqual(
        Buffer.from('{"result":"failed","receipt":"toolbox://receipt/failure"}\n'),
      );
      expect(failure.stderr).toEqual(Buffer.from("canonical failure\n"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps the fixed prefix in the exec body without duplicating it in delegation metadata", () => {
    const command = defineToolboxCommand({
      id: "toolbox-drift",
      title: "Toolbox drift",
      description: "test",
      executable: "/resolved/canonical/bin/toolbox",
      fixedArgv: ["knowledge", "search"],
      modality: "none",
      args: [],
      effectClass: "inspect",
      output: "canonical",
    });
    const parsed = parseCommandDefJson({
      ...command,
      body: {
        lang: "exec" as const,
        executable: command.body.lang === "exec" ? command.body.executable : "",
        args: ["deliver", "inspect"],
      },
    });
    expect(parsed.body).toEqual({
      lang: "exec",
      executable: "/resolved/canonical/bin/toolbox",
      args: ["deliver", "inspect"],
    });
    expect(parsed.delegation).toEqual(command.delegation);
  });

  test("rejects an executable path that is not canonical bin/toolbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-toolbox-resolution-"));
    const notToolbox = join(root, "not-toolbox");
    try {
      await writeFile(notToolbox, "#!/usr/bin/env bash\n");
      await chmod(notToolbox, 0o755);
      expect(() => resolveToolboxExecutable(notToolbox)).toThrow(
        "expected an executable regular bin/toolbox",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
