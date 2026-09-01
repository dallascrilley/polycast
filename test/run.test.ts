import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCommandJson, writeCommandsJson } from "../src/commands-store.ts";
import { defineCommand } from "../src/define.ts";
import { shortcutsTextShim } from "../src/shim.ts";

const uppercase = defineCommand({
  id: "uppercase",
  title: "Uppercase",
  description: "upper",
  modality: "text",
  body: { lang: "bash", source: "tr '[:lower:]' '[:upper:]'" },
});

const languageDispatchCommands = [
  defineCommand({
    id: "bash-dispatch",
    title: "Bash dispatch",
    description: "bash dispatch",
    modality: "text",
    body: { lang: "bash", source: "printf 'bash:%s' \"$(cat)\"" },
  }),
  defineCommand({
    id: "node-dispatch",
    title: "Node dispatch",
    description: "node dispatch",
    modality: "text",
    body: {
      lang: "node",
      source:
        'let input = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", (chunk) => input += chunk); process.stdin.on("end", () => process.stdout.write(`node:${input}`));',
    },
  }),
  defineCommand({
    id: "node-args-dispatch",
    title: "Node args dispatch",
    description: "node args dispatch",
    modality: "args",
    args: [{ name: "first" }, { name: "second" }],
    body: {
      lang: "node",
      source:
        "process.stdout.write(JSON.stringify({ script: process.argv[1], first: process.argv[2], second: process.argv[3] }));",
    },
  }),
  defineCommand({
    id: "applescript-dispatch",
    title: "AppleScript dispatch",
    description: "AppleScript dispatch",
    modality: "args",
    args: [{ name: "value" }],
    body: {
      lang: "applescript",
      source: ["on run argv", 'return "apple:" & item 1 of argv', "end run"].join("\n"),
    },
  }),
];

const echoArgs = defineCommand({
  id: "echo-args",
  title: "Echo Arguments",
  description: "echo arguments",
  modality: "args",
  args: [{ name: "value", optional: true }],
  body: { lang: "bash", source: 'printf "<%s>\\n" "$@"' },
});

describe("commands JSON store", () => {
  test("round-trips command defs for polycast run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "polycast-cmdstore-"));
    try {
      await writeCommandsJson([uppercase], dir);
      const loaded = await loadCommandJson("uppercase", dir);
      expect(loaded.body).toEqual(uppercase.body);

      await writeFile(
        join(dir, "uppercase.json"),
        `${JSON.stringify({ ...uppercase, body: { lang: "bash", source: "sed 's/.*/REPLACED/'" } }, null, 2)}\n`,
      );
      const reloaded = await loadCommandJson("uppercase", dir);
      expect(reloaded.body).toEqual({ lang: "bash", source: "sed 's/.*/REPLACED/'" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("polycast run integration", () => {
  test("forwards arguments after -- literally", async () => {
    const { spawnSync } = await import("node:child_process");
    const out = await mkdtemp(join(tmpdir(), "polycast-run-separator-"));
    const commandsDir = join(out, "commands");
    try {
      await writeCommandsJson([echoArgs], commandsDir);
      const result = spawnSync(
        "bun",
        [
          "run",
          "src/cli.ts",
          "run",
          "echo-args",
          "--commands",
          commandsDir,
          "--",
          "--target",
          "--strict",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("<--target>\n<--strict>\n");
      expect(result.stderr).toBe("");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  test("keeps run globals before -- while using the default command store", async () => {
    const { spawnSync } = await import("node:child_process");
    const out = await mkdtemp(join(tmpdir(), "polycast-run-separator-out-"));
    try {
      await writeCommandsJson([echoArgs], join(out, "commands"));
      const result = spawnSync(
        "bun",
        ["run", "src/cli.ts", "run", "echo-args", "--out", out, "--", "--target", "--strict"],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("<--target>\n<--strict>\n");
      expect(result.stderr).toBe("");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  test("keeps parsing globals after -- for non-run subcommands", async () => {
    const { spawnSync } = await import("node:child_process");
    const out = await mkdtemp(join(tmpdir(), "polycast-build-separator-"));
    try {
      const result = spawnSync(
        "bun",
        ["run", "src/cli.ts", "build", "--out", out, "--", "--target", "agent-cli"],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("emit  agent-cli/basename-files");
      expect(result.stdout).not.toContain("emit popclip/");
      expect(result.stderr).toBe("");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  test("run executes JSON body; stub unchanged after body edit", async () => {
    const { spawnSync } = await import("node:child_process");
    const out = await mkdtemp(join(tmpdir(), "polycast-run-int-"));
    const commandsDir = join(out, "commands");
    try {
      await writeCommandsJson([uppercase], commandsDir);
      const first = spawnSync(
        "bun",
        ["run", "src/cli.ts", "run", "uppercase", "--commands", commandsDir, "--text", "hi"],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(first.status).toBe(0);
      expect(first.stdout?.trim()).toBe("HI");

      await writeFile(
        join(commandsDir, "uppercase.json"),
        `${JSON.stringify({ ...uppercase, body: { lang: "bash", source: "echo changed" } }, null, 2)}\n`,
      );
      const second = spawnSync(
        "bun",
        ["run", "src/cli.ts", "run", "uppercase", "--commands", commandsDir, "--text", "ignored"],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(second.status).toBe(0);
      expect(second.stdout?.trim()).toBe("changed");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  test("shortcuts text shim runs JSON body after store edit", async () => {
    const { spawnSync } = await import("node:child_process");
    const { chmod, writeFile } = await import("node:fs/promises");
    const out = await mkdtemp(join(tmpdir(), "polycast-run-sc-"));
    const commandsDir = join(out, "commands");
    const polycastBin = join(out, "polycast-bin");
    try {
      await writeCommandsJson([uppercase], commandsDir);
      await writeFile(
        polycastBin,
        `#!/usr/bin/env bash\nexec bun run ${join(process.cwd(), "src/cli.ts")} "$@"\n`,
      );
      await chmod(polycastBin, 0o755);

      const shimScript = `#!/usr/bin/env bash\n${shortcutsTextShim(uppercase)}\n`;
      const first = spawnSync("bash", ["-c", shimScript], {
        cwd: process.cwd(),
        encoding: "utf8",
        input: "hi",
        env: {
          ...process.env,
          POLYCAST_BIN: polycastBin,
          POLYCAST_COMMANDS_DIR: commandsDir,
        },
      });
      expect(first.status).toBe(0);
      expect(first.stdout?.trim()).toBe("HI");

      await writeFile(
        join(commandsDir, "uppercase.json"),
        `${JSON.stringify({ ...uppercase, body: { lang: "bash", source: "echo shortcut-changed" } }, null, 2)}\n`,
      );
      const second = spawnSync("bash", ["-c", shimScript], {
        cwd: process.cwd(),
        encoding: "utf8",
        input: "ignored",
        env: {
          ...process.env,
          POLYCAST_BIN: polycastBin,
          POLYCAST_COMMANDS_DIR: commandsDir,
        },
      });
      expect(second.status).toBe(0);
      expect(second.stdout?.trim()).toBe("shortcut-changed");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});

describe.skipIf(process.platform !== "darwin")("language dispatch", () => {
  test("runs Bash, Node, and AppleScript bodies with their declared interpreter", async () => {
    const out = await mkdtemp(join(tmpdir(), "polycast-run-languages-"));
    const commandsDir = join(out, "commands");
    try {
      await writeCommandsJson(languageDispatchCommands, commandsDir);

      const bash = spawnRun(commandsDir, "bash-dispatch", ["--text", "input"]);
      expect(bash.status).toBe(0);
      expect(bash.stdout).toBe("bash:input");

      const node = spawnRun(commandsDir, "node-dispatch", ["--text", "input"]);
      expect(node.status).toBe(0);
      expect(node.stdout).toBe("node:input");

      const nodeArgs = spawnRun(commandsDir, "node-args-dispatch", ["--", "first", "-second"]);
      expect(nodeArgs.status).toBe(0);
      expect(nodeArgs.stdout).toBe('{"script":"polycast-run","first":"first","second":"-second"}');

      const applescript = spawnRun(commandsDir, "applescript-dispatch", ["--", "-input"]);
      expect(applescript.status).toBe(0);
      expect(applescript.stdout).toBe("apple:-input\n");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});

function spawnRun(commandsDir: string, id: string, args: readonly string[]) {
  return spawnSync("bun", ["run", "src/cli.ts", "run", id, "--commands", commandsDir, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}
