import { describe, expect, test } from "bun:test";
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

describe("commands JSON store", () => {
  test("round-trips command defs for polycast run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "polycast-cmdstore-"));
    try {
      await writeCommandsJson([uppercase], dir);
      const loaded = await loadCommandJson("uppercase", dir);
      expect(loaded.body.source).toBe(uppercase.body.source);

      await writeFile(
        join(dir, "uppercase.json"),
        `${JSON.stringify({ ...uppercase, body: { lang: "bash", source: "sed 's/.*/REPLACED/'" } }, null, 2)}\n`,
      );
      const reloaded = await loadCommandJson("uppercase", dir);
      expect(reloaded.body.source).toBe("sed 's/.*/REPLACED/'");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("polycast run integration", () => {
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
