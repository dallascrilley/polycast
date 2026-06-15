import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyBuilt } from "../src/apply.ts";

async function polycastWrapperScript(root: string): Promise<string> {
  const wrapper = join(root, "polycast-wrapper.sh");
  await writeFile(
    wrapper,
    `#!/usr/bin/env bash\nexec bun run ${join(process.cwd(), "src/cli.ts")} "$@"\n`,
  );
  await chmod(wrapper, 0o755);
  return wrapper;
}

/** Level B proof for LAUNCH_CRITERIA P1-2 using temp install dirs (no live Dropzone UI). */
describe("operator apply verification (P1-2)", () => {
  test("agent-cli apply --write: stub runs and picks up JSON body edits", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-p12-agent-"));
    const buildOut = join(root, "build");
    const agentBin = join(root, "agent-bin");
    const commandsStore = join(root, "commands-store");
    const polycastBin = await polycastWrapperScript(root);

    const prev = {
      agent: process.env.POLYCAST_AGENT_BIN,
      commands: process.env.POLYCAST_COMMANDS_DIR,
      bin: process.env.POLYCAST_BIN,
      skip: process.env.POLYCAST_SKIP_CHERRI,
    };
    process.env.POLYCAST_AGENT_BIN = agentBin;
    process.env.POLYCAST_COMMANDS_DIR = commandsStore;
    process.env.POLYCAST_BIN = polycastBin;
    process.env.POLYCAST_SKIP_CHERRI = "1";

    try {
      const build = spawnSync(
        "bun",
        ["run", "src/cli.ts", "build", "--out", buildOut, "--strict", "--target", "agent-cli"],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(build.status).toBe(0);

      const dry = await applyBuilt({
        outRoot: buildOut,
        write: false,
        targets: ["agent-cli"],
      });
      expect(dry.some((r) => r.target === "commands-store" && r.action === "would install")).toBe(
        true,
      );

      const applied = await applyBuilt({
        outRoot: buildOut,
        write: true,
        targets: ["agent-cli"],
      });
      expect(applied.some((r) => r.action === "install" && r.path.endsWith("/uppercase"))).toBe(
        true,
      );

      await access(join(agentBin, "uppercase"));
      await access(join(commandsStore, "uppercase.json"));

      const first = spawnSync(join(agentBin, "uppercase"), ["--text", "hi"], {
        encoding: "utf8",
        env: process.env,
      });
      expect(first.status).toBe(0);
      expect(first.stdout?.trim()).toBe("HI");

      const jsonPath = join(commandsStore, "uppercase.json");
      const stored = JSON.parse(await readFile(jsonPath, "utf8"));
      stored.body = { lang: "bash", source: "echo changed" };
      await writeFile(jsonPath, `${JSON.stringify(stored, null, 2)}\n`);

      const second = spawnSync(join(agentBin, "uppercase"), ["--text", "ignored"], {
        encoding: "utf8",
        env: process.env,
      });
      expect(second.status).toBe(0);
      expect(second.stdout?.trim()).toBe("changed");
    } finally {
      for (const [key, val] of Object.entries(prev)) {
        const envKey =
          key === "agent"
            ? "POLYCAST_AGENT_BIN"
            : key === "commands"
              ? "POLYCAST_COMMANDS_DIR"
              : key === "bin"
                ? "POLYCAST_BIN"
                : "POLYCAST_SKIP_CHERRI";
        if (val === undefined) delete process.env[envKey];
        else process.env[envKey] = val;
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  test("dropzone apply --write: dispatcher run.sh executes and picks up JSON edits", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-p12-dz-"));
    const buildOut = join(root, "build");
    const dropzoneDir = join(root, "dropzone-actions");
    const commandsStore = join(root, "commands-store");
    const polycastBin = await polycastWrapperScript(root);

    const prev = {
      dropzone: process.env.POLYCAST_DROPZONE_ACTIONS,
      commands: process.env.POLYCAST_COMMANDS_DIR,
      bin: process.env.POLYCAST_BIN,
      skip: process.env.POLYCAST_SKIP_CHERRI,
    };
    process.env.POLYCAST_DROPZONE_ACTIONS = dropzoneDir;
    process.env.POLYCAST_COMMANDS_DIR = commandsStore;
    process.env.POLYCAST_BIN = polycastBin;
    process.env.POLYCAST_SKIP_CHERRI = "1";

    try {
      expect(
        spawnSync("bun", ["run", "src/cli.ts", "build", "--out", buildOut, "--strict"], {
          cwd: process.cwd(),
          encoding: "utf8",
        }).status,
      ).toBe(0);

      const applied = await applyBuilt({
        outRoot: buildOut,
        write: true,
        targets: ["dropzone"],
      });
      expect(applied.some((r) => r.path.includes("basename-files.dzbundle"))).toBe(true);

      const runSh = join(dropzoneDir, "basename-files.dzbundle", "run.sh");
      const runContents = await readFile(runSh, "utf8");
      expect(runContents).toContain(" run --commands ");

      const sampleFile = join(root, "sample doc.txt");
      await writeFile(sampleFile, "x");

      const first = spawnSync("bash", [runSh, sampleFile], {
        encoding: "utf8",
        env: process.env,
      });
      expect(first.status).toBe(0);
      expect(first.stdout?.trim()).toBe("sample doc.txt");

      const jsonPath = join(commandsStore, "basename-files.json");
      const stored = JSON.parse(await readFile(jsonPath, "utf8"));
      stored.body = {
        lang: "bash",
        source: 'for f in "$@"; do basename "$f" | tr "[:lower:]" "[:upper:]"; done',
      };
      await writeFile(jsonPath, `${JSON.stringify(stored, null, 2)}\n`);

      const second = spawnSync("bash", [runSh, sampleFile], {
        encoding: "utf8",
        env: process.env,
      });
      expect(second.status).toBe(0);
      expect(second.stdout?.trim()).toBe("SAMPLE DOC.TXT");
    } finally {
      for (const [key, val] of Object.entries(prev)) {
        const envKey =
          key === "dropzone"
            ? "POLYCAST_DROPZONE_ACTIONS"
            : key === "commands"
              ? "POLYCAST_COMMANDS_DIR"
              : key === "bin"
                ? "POLYCAST_BIN"
                : "POLYCAST_SKIP_CHERRI";
        if (val === undefined) delete process.env[envKey];
        else process.env[envKey] = val;
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  test("dropover apply --write: staged script runs and picks up JSON edits", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-p12-do-"));
    const buildOut = join(root, "build");
    const dropoverDir = join(root, "dropover-staging");
    const commandsStore = join(root, "commands-store");
    const polycastBin = await polycastWrapperScript(root);

    const prev = {
      dropover: process.env.POLYCAST_DROPOVER_SCRIPTS,
      commands: process.env.POLYCAST_COMMANDS_DIR,
      bin: process.env.POLYCAST_BIN,
      skip: process.env.POLYCAST_SKIP_CHERRI,
    };
    process.env.POLYCAST_DROPOVER_SCRIPTS = dropoverDir;
    process.env.POLYCAST_COMMANDS_DIR = commandsStore;
    process.env.POLYCAST_BIN = polycastBin;
    process.env.POLYCAST_SKIP_CHERRI = "1";

    try {
      expect(
        spawnSync(
          "bun",
          [
            "run",
            "src/cli.ts",
            "build",
            "--out",
            buildOut,
            "--strict",
            "--target",
            "dropover-script",
          ],
          { cwd: process.cwd(), encoding: "utf8" },
        ).status,
      ).toBe(0);

      const applied = await applyBuilt({
        outRoot: buildOut,
        write: true,
        targets: ["dropover-script"],
      });
      expect(applied.some((r) => r.target === "dropover-script" && r.action === "note")).toBe(true);
      expect(applied.some((r) => r.path.endsWith("/basename-files.sh"))).toBe(true);

      await access(join(dropoverDir, "manifest.json"));
      await access(join(dropoverDir, "basename-files.sh"));
      await access(join(commandsStore, "basename-files.json"));

      const scriptSh = join(dropoverDir, "basename-files.sh");
      const scriptContents = await readFile(scriptSh, "utf8");
      expect(scriptContents).toContain(" run --commands ");

      const sampleFile = join(root, "sample doc.txt");
      await writeFile(sampleFile, "x");

      const first = spawnSync("bash", [scriptSh, sampleFile], {
        encoding: "utf8",
        env: process.env,
      });
      expect(first.status).toBe(0);
      expect(first.stdout?.trim()).toBe("sample doc.txt");

      const jsonPath = join(commandsStore, "basename-files.json");
      const stored = JSON.parse(await readFile(jsonPath, "utf8"));
      stored.body = {
        lang: "bash",
        source: 'for f in "$@"; do basename "$f" | tr "[:lower:]" "[:upper:]"; done',
      };
      await writeFile(jsonPath, `${JSON.stringify(stored, null, 2)}\n`);

      const second = spawnSync("bash", [scriptSh, sampleFile], {
        encoding: "utf8",
        env: process.env,
      });
      expect(second.status).toBe(0);
      expect(second.stdout?.trim()).toBe("SAMPLE DOC.TXT");
    } finally {
      for (const [key, val] of Object.entries(prev)) {
        const envKey =
          key === "dropover"
            ? "POLYCAST_DROPOVER_SCRIPTS"
            : key === "commands"
              ? "POLYCAST_COMMANDS_DIR"
              : key === "bin"
                ? "POLYCAST_BIN"
                : "POLYCAST_SKIP_CHERRI";
        if (val === undefined) delete process.env[envKey];
        else process.env[envKey] = val;
      }
      await rm(root, { recursive: true, force: true });
    }
  });
});
