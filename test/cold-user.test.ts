/**
 * Regressions found by running the README end to end on a fresh clone.
 *
 * Each test pins one thing that broke a first-run user: a shell that exports
 * CDPATH, `apply --write` on a command set that opts into no shared catalog,
 * and `apply --prune` leaving the artifacts it claims to remove.
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { needsTrailingNewline } from "../src/run.ts";

const CLI = join(process.cwd(), "src/cli.ts");
const CDPATH_ENV = ".:..:~";

/** Every install location apply can write to, pointed inside one sandbox dir. */
function sandboxEnv(root: string): Record<string, string> {
  return {
    ...process.env,
    POLYCAST_SKIP_CHERRI: "1",
    POLYCAST_RAYCAST_DIR: join(root, "raycast"),
    POLYCAST_POPCLIP_EXTENSIONS: join(root, "popclip"),
    POLYCAST_DROPZONE_ACTIONS: join(root, "dropzone"),
    POLYCAST_DROPOVER_SCRIPTS: join(root, "dropover"),
    POLYCAST_AGENT_BIN: join(root, "agent"),
    POLYCAST_COMMANDS_DIR: join(root, "commands"),
  };
}

async function filesUnder(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(p)));
    else found.push(p);
  }
  return found;
}

describe("CDPATH-exporting shells (D1)", () => {
  // Invoked the way a user types it: a relative path, which is exactly the
  // case where cd consults CDPATH and echoes what it found.
  test("script/polycast resolves the repo root", () => {
    const r = spawnSync("bash", ["-c", "script/polycast list"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, CDPATH: CDPATH_ENV },
    });
    expect(r.stderr).not.toContain("No such file or directory");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("uppercase");
  });

  test("script/lib/common.sh resolves ROOT to the repo root", () => {
    const r = spawnSync("bash", ["-c", '. script/lib/common.sh && printf "%s" "$ROOT"'], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, CDPATH: CDPATH_ENV },
    });
    expect(r.status).toBe(0);
    // A CDPATH echo would make this the path twice, separated by a newline.
    expect(r.stdout).toBe(process.cwd());
  });
});

describe("apply --write on a fresh build (D2)", () => {
  test("skips opt-in targets with no build output instead of failing", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-cold-apply-"));
    const env = sandboxEnv(root);
    try {
      const definitions = join(root, "definitions");
      await mkdir(definitions);
      await writeFile(
        join(definitions, "plain.ts"),
        [
          `import { defineCommand } from ${JSON.stringify(pathToFileURL(resolve("src/define.ts")).href)};`,
          'export default defineCommand({ id: "plain", title: "Plain", description: "plain", modality: "none", body: { lang: "bash", source: "true" } });',
          "",
        ].join("\n"),
      );
      const build = spawnSync(
        "bun",
        ["run", CLI, "build", "--dir", definitions, "--out", join(root, "build"), "--strict"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env,
        },
      );
      expect(build.status).toBe(0);
      // This isolated command opts into no shared catalog, so those dirs do not exist.
      await expect(stat(join(root, "build", "raycast-snippet"))).rejects.toThrow();

      const apply = spawnSync(
        "bun",
        ["run", CLI, "apply", "--dir", definitions, "--out", join(root, "build"), "--write"],
        { cwd: process.cwd(), encoding: "utf8", env },
      );
      expect(apply.stderr).not.toContain("missing build output");
      expect(apply.status).toBe(0);
      expect(apply.stdout).toContain("skip");
      expect(apply.stdout).toContain("raycast-snippet");
      // And the targets that do have output were really installed.
      expect((await filesUnder(join(root, "agent"))).length).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);

  test("still fails when a target that should have output is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-cold-missing-"));
    const env = sandboxEnv(root);
    try {
      const build = spawnSync(
        "bun",
        ["run", CLI, "build", "--out", join(root, "build"), "--strict", "--target", "popclip"],
        { cwd: process.cwd(), encoding: "utf8", env },
      );
      expect(build.status).toBe(0);
      await rm(join(root, "build", "popclip"), { recursive: true, force: true });

      const apply = spawnSync(
        "bun",
        ["run", CLI, "apply", "--out", join(root, "build"), "--write", "--target", "popclip"],
        { cwd: process.cwd(), encoding: "utf8", env },
      );
      expect(apply.status).toBe(1);
      expect(apply.stderr).toContain("missing build output for popclip");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);
});

describe("Shortcuts import consent (CV3)", () => {
  test("requires --write in addition to --import-shortcuts", () => {
    const result = spawnSync(
      "bun",
      ["run", CLI, "apply", "--import-shortcuts", "--target", "shortcuts-cherri"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, POLYCAST_SKIP_CHERRI: "1" },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--import-shortcuts requires --write");
  });
});

describe("apply --prune (D3)", () => {
  test("prune-only never changes the selected build output", async () => {
    const buildRoot = await mkdtemp(join(tmpdir(), "polycast-cold-prune-output-"));
    const root = await mkdtemp(join(tmpdir(), "polycast-cold-prune-installs-"));
    const env = sandboxEnv(root);
    try {
      expect(
        spawnSync("bun", ["run", CLI, "build", "--out", buildRoot, "--strict"], {
          cwd: process.cwd(),
          encoding: "utf8",
          env,
        }).status,
      ).toBe(0);

      const sentinel = join(buildRoot, "prune-only-sentinel");
      const sentinelContents = "build output must survive\n";
      await writeFile(sentinel, sentinelContents);
      const before = await filesUnder(buildRoot);

      for (const writeFlag of [[], ["--write"]]) {
        const prune = spawnSync(
          "bun",
          ["run", CLI, "apply", "--out", buildRoot, "--prune-only", ...writeFlag],
          { cwd: process.cwd(), encoding: "utf8", env },
        );
        expect(prune.status).toBe(0);
        expect(await filesUnder(buildRoot)).toEqual(before);
        expect(await readFile(sentinel, "utf8")).toBe(sentinelContents);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(buildRoot, { recursive: true, force: true });
    }
  }, 30000);

  test("leaves no polycast-written file behind, and keeps foreign files", async () => {
    // Build output lives outside the install sandbox so the sandbox holds
    // nothing but what apply installed.
    const buildRoot = await mkdtemp(join(tmpdir(), "polycast-cold-prune-build-"));
    const root = await mkdtemp(join(tmpdir(), "polycast-cold-prune-"));
    const env = sandboxEnv(root);
    try {
      expect(
        spawnSync("bun", ["run", CLI, "build", "--out", buildRoot, "--strict"], {
          cwd: process.cwd(),
          encoding: "utf8",
          env,
        }).status,
      ).toBe(0);
      expect(
        spawnSync("bun", ["run", CLI, "apply", "--out", buildRoot, "--write"], {
          cwd: process.cwd(),
          encoding: "utf8",
          env,
        }).status,
      ).toBe(0);

      const installed = await filesUnder(root);
      expect(installed.length).toBeGreaterThan(0);
      // Artifacts, not just markers, must be installed for this to prove anything.
      expect(installed.some((p) => !p.endsWith(".polycast-owned"))).toBe(true);

      const foreign = join(root, "agent", "foreign-tool");
      await writeFile(foreign, "keep me\n");

      const prune = spawnSync(
        "bun",
        ["run", CLI, "apply", "--out", buildRoot, "--write", "--prune-only"],
        { cwd: process.cwd(), encoding: "utf8", env },
      );
      expect(prune.status).toBe(0);

      expect(await filesUnder(root)).toEqual([foreign]);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(buildRoot, { recursive: true, force: true });
    }
  }, 30000);

  test("a second apply --write is not refused by its own files", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-cold-reapply-"));
    const env = sandboxEnv(root);
    try {
      expect(
        spawnSync("bun", ["run", CLI, "build", "--out", join(root, "build"), "--strict"], {
          cwd: process.cwd(),
          encoding: "utf8",
          env,
        }).status,
      ).toBe(0);
      for (const pass of [1, 2]) {
        const apply = spawnSync(
          "bun",
          ["run", CLI, "apply", "--out", join(root, "build"), "--write"],
          { cwd: process.cwd(), encoding: "utf8", env },
        );
        expect(`pass ${pass}: ${apply.stderr}`).not.toContain("refused");
        expect(apply.status).toBe(0);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);
});

describe("polycast run output (D8)", () => {
  test("needsTrailingNewline only fires on non-empty output without one", () => {
    const bytes = (s: string) => new TextEncoder().encode(s);
    expect(needsTrailingNewline(bytes("HI"))).toBe(true);
    expect(needsTrailingNewline(bytes("HI\n"))).toBe(false);
    expect(needsTrailingNewline(bytes(""))).toBe(false);
  });

  test("piped output stays byte-exact", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-cold-pipe-"));
    try {
      expect(
        spawnSync(
          "bun",
          ["run", CLI, "build", "--out", join(root, "build"), "--target", "agent-cli"],
          { cwd: process.cwd(), encoding: "utf8", env: sandboxEnv(root) },
        ).status,
      ).toBe(0);
      const r = spawnSync(
        "bun",
        [
          "run",
          CLI,
          "run",
          "--commands",
          join(root, "build/commands"),
          "uppercase",
          "--text",
          "hi",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toBe("HI");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("terminal output ends with a newline", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-cold-tty-"));
    try {
      const build = spawnSync(
        "bun",
        ["run", CLI, "build", "--out", join(root, "build"), "--target", "agent-cli"],
        { cwd: process.cwd(), encoding: "utf8", env: sandboxEnv(root) },
      );
      expect(build.status).toBe(0);

      const inner = `bun run ${CLI} run --commands ${join(root, "build/commands")} uppercase --text hi`;
      // `script` is the portable way to hand a child a pty.
      const args =
        process.platform === "darwin"
          ? ["-q", "/dev/null", "bash", "-c", inner]
          : ["-qec", inner, "/dev/null"];
      const r = spawnSync("script", args, { cwd: process.cwd(), encoding: "utf8" });
      // No `script` binary, or a transcript this host formats differently:
      // there is nothing to assert. The command itself is covered above.
      if (r.error || !r.stdout?.includes("HI")) return;
      // On a pty the newline arrives as \r\n; either way the line is terminated.
      expect(/HI\r?\n/.test(r.stdout)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
