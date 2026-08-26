import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { POLYCAST_VERSION } from "../src/constants.ts";

const wrapper = join(process.cwd(), "script/polycast");

describe("script/polycast wrapper", () => {
  test("list subcommand exits 0", () => {
    const r = spawnSync(wrapper, ["list"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("uppercase");
  });

  test("runner list subcommand uses the separate runners directory", () => {
    const r = spawnSync(wrapper, ["runner", "list"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("polycast.worktree-review");
    expect(r.stdout).toContain("orca-plugin");
    expect(r.stdout).toContain("codex-cli");
  });

  test("help documents runner targets and target selection", () => {
    const r = spawnSync(wrapper, ["--help"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("polycast runner targets");
    expect(r.stdout).toContain("polycast runner build");
    expect(r.stdout).toContain("[--target <a,b>]");
  });

  test("runner targets lists the registry in order", () => {
    const r = spawnSync(wrapper, ["runner", "targets"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("orca-plugin\ncodex-cli\n");
  });

  test("runner build accepts an explicit dual-target selection", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-wrapper-dual-"));
    const out = join(root, "build");
    try {
      const r = spawnSync(
        wrapper,
        ["runner", "build", "--target", "orca-plugin,codex-cli", "--out", out],
        { encoding: "utf8" },
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("orca-plugin/polycast.worktree-review/orca-plugin.json");
      expect(r.stdout).toContain("codex-cli/polycast.worktree-review/review-worktree");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test.each([
    ["unknown", "unknown runner target"],
    ["", "at least one runner target"],
  ])("runner build rejects target selection %j", async (target, message) => {
    const root = await mkdtemp(join(tmpdir(), "polycast-wrapper-target-"));
    const out = join(root, "build");
    try {
      const r = spawnSync(wrapper, ["runner", "build", "--target", target, "--out", out], {
        encoding: "utf8",
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(message);
      await expect(readdir(out)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("runner build rejects an explicitly incompatible target before writing", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-wrapper-incompatible-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    await mkdir(definitions);
    const staged = {
      kind: "runner",
      id: "staged",
      publisher: "example",
      title: "Staged prompt",
      version: POLYCAST_VERSION,
      commands: [
        {
          kind: "prompt",
          id: "draft",
          title: "Draft",
          context: "worktree",
          prompt: "Draft a plan.",
          mode: "stage",
        },
      ],
    };
    await writeFile(join(definitions, "staged.ts"), `export default ${JSON.stringify(staged)};\n`);
    try {
      const r = spawnSync(
        wrapper,
        ["runner", "build", "--dir", definitions, "--target", "codex-cli", "--out", out],
        { encoding: "utf8" },
      );
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("incompatible runner target selection");
      await expect(readdir(out)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("runner list warns once for a legacy source normalized by defineRunner", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-wrapper-legacy-"));
    const definitions = join(root, "runners");
    await mkdir(definitions);
    const defineUrl = pathToFileURL(join(process.cwd(), "src/runners/define.ts")).href;
    const legacy = {
      kind: "orca-plugin",
      id: "legacy",
      publisher: "example",
      title: "Legacy",
      version: POLYCAST_VERSION,
      engine: ">=1.4.188",
      commands: [
        {
          kind: "terminal-prompt",
          id: "review",
          title: "Review",
          context: "worktree",
          prompt: "Review this worktree.",
          enter: "submit",
        },
      ],
    };
    await writeFile(
      join(definitions, "legacy.ts"),
      `import { defineRunner } from ${JSON.stringify(defineUrl)};\nexport default defineRunner(${JSON.stringify(legacy)});\n`,
    );
    try {
      const r = spawnSync(wrapper, ["runner", "list", "--dir", definitions], {
        encoding: "utf8",
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("example.legacy");
      expect(r.stderr.match(/deprecated RunnerDef/g)).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("script/dogfood-level-a", () => {
  test("--help exits 0", () => {
    const script = join(process.cwd(), "script/dogfood-level-a");
    const r = spawnSync(script, ["--help"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("td-ff727f");
    expect(r.stdout).toContain("level-a-dogfood");
  });
});
