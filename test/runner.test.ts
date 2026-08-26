import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { POLYCAST_VERSION } from "../src/constants.ts";
import { polycastRunnerBuild, polycastRunnerList } from "../src/runner-api.ts";
import { emitCodexCliBundle } from "../src/runners/codex-cli.ts";
import { defineRunner } from "../src/runners/define.ts";
import { loadRunners } from "../src/runners/load.ts";
import {
  emitOrcaPluginBundle,
  renderOrcaPluginManifest,
  renderOrcaPluginWorker,
} from "../src/runners/orca-plugin.ts";
import { runnerEmitterFor, runnerEmitters } from "../src/runners/registry.ts";
import { LEGACY_RUNNER_WARNING, type RunnerDef } from "../src/runners/schema.ts";
import { isSafeBuildRelativePath } from "../src/runners/types.ts";

const sample = defineRunner({
  kind: "runner",
  id: "review-prompts",
  publisher: "example",
  title: "Review prompts",
  description: "Generic prompts for reviewing a worktree.",
  version: POLYCAST_VERSION,
  commands: [
    {
      kind: "prompt",
      id: "review-worktree",
      title: "Review worktree",
      context: "worktree",
      prompt: "Review the current worktree.",
      mode: "run",
    },
    {
      kind: "prompt",
      id: "draft-plan",
      title: "Draft plan",
      context: "worktree",
      prompt: "Draft a plan for the current worktree.",
      mode: "stage",
    },
  ],
  x: { "orca-plugin": { engine: ">=1.4.188" } },
});

const runCommand = sample.commands[0];
if (!runCommand) throw new Error("sample runner must include a run command");

const runOnlySample = defineRunner({
  ...sample,
  commands: [runCommand],
});

type HostCall = { readonly method: string; readonly params: unknown };
type CommandHandler = () => Promise<unknown>;

async function loadWorker(): Promise<(api: unknown) => void> {
  const root = await mkdtemp(join(tmpdir(), "polycast-runner-worker-"));
  const path = join(root, "main.mjs");
  try {
    await writeFile(path, renderOrcaPluginWorker(sample));
    const module: unknown = await import(`${pathToFileURL(path).href}?test=${Date.now()}`);
    if (typeof module !== "object" || module === null || !("default" in module)) {
      throw new Error("generated worker has no default export");
    }
    if (typeof module.default !== "function") {
      throw new Error("generated worker default export is not a function");
    }
    const activate = module.default;
    return (api: unknown) => activate(api);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function activateWithTerminals(terminals: readonly { readonly id: string }[]) {
  const activate = await loadWorker();
  const handlers = new Map<string, CommandHandler>();
  const calls: HostCall[] = [];
  activate({
    commands: {
      register(id: string, handler: CommandHandler) {
        handlers.set(id, handler);
      },
    },
    host: {
      async call(method: string, params?: unknown) {
        calls.push({ method, params });
        if (method === "workspace.readContext") {
          return { branch: "main", displayName: "fixture", terminals };
        }
        if (method === "terminal.sendText") return { accepted: true };
        throw new Error(`unexpected host method: ${method}`);
      },
    },
  });
  return { calls, handlers };
}

async function writeRunnerModule(
  definitions: string,
  fileName: string,
  runner: RunnerDef,
): Promise<void> {
  await writeFile(join(definitions, fileName), `export default ${JSON.stringify(runner)};\n`);
}

async function expectNoDirectory(path: string): Promise<void> {
  await expect(readdir(path)).rejects.toThrow();
}

function promptCommand(id: string): RunnerDef["commands"][number] {
  return {
    kind: "prompt",
    id,
    title: id,
    context: "worktree",
    prompt: `Run ${id}`,
    mode: "run",
  };
}

describe("Orca plugin runner emission", () => {
  test("emits deterministic bundle paths and bytes", () => {
    const first = emitOrcaPluginBundle(sample);
    const second = emitOrcaPluginBundle(sample);
    expect(first).toEqual(second);
    expect(first.map((file) => file.path)).toEqual([
      "orca-plugin/example.review-prompts/orca-plugin.json",
      "orca-plugin/example.review-prompts/main.mjs",
    ]);
  });

  test("preserves the manifest shape and exact capabilities", () => {
    const manifest = JSON.parse(renderOrcaPluginManifest(sample));
    expect(manifest).toEqual({
      manifestVersion: 1,
      id: "review-prompts",
      publisher: "example",
      name: "Review prompts",
      version: POLYCAST_VERSION,
      description: "Generic prompts for reviewing a worktree.",
      engines: { orca: ">=1.4.188" },
      pluginApi: 1,
      main: "main.mjs",
      contributes: {
        commands: [
          { id: "review-worktree", title: "Review worktree", context: "worktree" },
          { id: "draft-plan", title: "Draft plan", context: "worktree" },
        ],
      },
      capabilities: [{ kind: "workspace:read" }, { kind: "terminal:send" }],
    });
  });

  test("registers every worker command", async () => {
    const { handlers } = await activateWithTerminals([{ id: "terminal-1" }]);
    expect([...handlers.keys()]).toEqual(["review-worktree", "draft-plan"]);
  });

  test("maps run mode to sending the prompt with Enter", async () => {
    const { calls, handlers } = await activateWithTerminals([{ id: "terminal-1" }]);
    const handler = handlers.get("review-worktree");
    if (!handler) throw new Error("review-worktree was not registered");
    await expect(handler()).resolves.toEqual({ accepted: true });
    expect(calls).toEqual([
      { method: "workspace.readContext", params: undefined },
      {
        method: "terminal.sendText",
        params: {
          terminalId: "terminal-1",
          text: "Review the current worktree.",
          enter: true,
        },
      },
    ]);
  });

  test("maps stage mode to insertion without Enter", async () => {
    const { calls, handlers } = await activateWithTerminals([{ id: "terminal-1" }]);
    const handler = handlers.get("draft-plan");
    if (!handler) throw new Error("draft-plan was not registered");
    await handler();
    expect(calls[1]).toEqual({
      method: "terminal.sendText",
      params: {
        terminalId: "terminal-1",
        text: "Draft a plan for the current worktree.",
        enter: false,
      },
    });
  });

  test.each([
    ["zero", []],
    ["multiple", [{ id: "terminal-1" }, { id: "terminal-2" }]],
  ])("refuses %s terminals without sending text", async (_label, terminals) => {
    const { calls, handlers } = await activateWithTerminals(terminals);
    const handler = handlers.get("review-worktree");
    if (!handler) throw new Error("review-worktree was not registered");
    await expect(handler()).rejects.toThrow(
      `requires exactly one terminal; found ${terminals.length}`,
    );
    expect(calls).toEqual([{ method: "workspace.readContext", params: undefined }]);
  });
});

describe("runner emitter registry", () => {
  test("discovers targets in deterministic order", () => {
    expect(runnerEmitters.map((emitter) => emitter.target)).toEqual(["orca-plugin", "codex-cli"]);
    expect(runnerEmitterFor("codex-cli")?.target).toBe("codex-cli");
    expect(runnerEmitterFor("unknown")).toBeUndefined();
  });

  test("reports exact target incompatibilities", () => {
    const withoutOrca = defineRunner({ ...runOnlySample, x: undefined });
    expect(runnerEmitterFor("orca-plugin")?.compatibility(withoutOrca)).toEqual({
      status: "skipped",
      reason: "runner has no x.orca-plugin engine hint",
    });
    expect(runnerEmitterFor("codex-cli")?.compatibility(sample)).toEqual({
      status: "skipped",
      reason: 'command "draft-plan" uses mode "stage", which codex-cli cannot represent',
    });
  });

  test.each([
    "",
    "/absolute",
    "../escape",
    "a/../escape",
    "a\\b",
    "a//b",
  ])("rejects unsafe emitted path %s", (path) => expect(isSafeBuildRelativePath(path)).toBe(false));
});

describe("Codex CLI runner emission", () => {
  test("emits exact paths, prompt bytes, metadata, and executable mode", () => {
    const files = emitCodexCliBundle(runOnlySample);
    expect(files.map((file) => file.path)).toEqual([
      "codex-cli/example.review-prompts/review-worktree",
      "codex-cli/example.review-prompts/review-worktree.prompt.txt",
      "codex-cli/example.review-prompts/runner.json",
    ]);
    expect(files[0]?.mode).toBe(0o755);
    expect(files[1]?.contents).toBe("Review the current worktree.\n");
    const metadata = JSON.parse(files[2]?.contents ?? "");
    expect(metadata).toEqual({
      schemaVersion: 1,
      id: "example.review-prompts",
      publisher: "example",
      runnerId: "review-prompts",
      title: "Review prompts",
      description: "Generic prompts for reviewing a worktree.",
      version: POLYCAST_VERSION,
      commands: [
        {
          id: "review-worktree",
          title: "Review worktree",
          context: "worktree",
          mode: "run",
          executable: "review-worktree",
          promptFile: "review-worktree.prompt.txt",
        },
      ],
    });
    expect(files[2]?.contents).not.toContain("orca");
  });

  test.each([
    ["current directory", false],
    ["one worktree argument", true],
  ])("executes with prompt on stdin from %s", async (_label, passArgument) => {
    const root = await mkdtemp(join(tmpdir(), "polycast-codex-wrapper-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    const worktree = join(root, "repo");
    const nested = join(worktree, "nested");
    const fakeBin = join(root, "bin");
    const capture = join(root, "capture");
    await Promise.all([
      mkdir(definitions),
      mkdir(nested, { recursive: true }),
      mkdir(fakeBin),
      mkdir(capture),
    ]);
    await writeRunnerModule(definitions, "runner.ts", runOnlySample);
    expect(spawnSync("git", ["init", "-q", worktree]).status).toBe(0);
    const fakeCodex = join(fakeBin, "codex");
    await writeFile(
      fakeCodex,
      [
        "#!/bin/bash",
        "set -euo pipefail",
        'printf "%s\\n" "$@" > "$CAPTURE_DIR/args"',
        'pwd > "$CAPTURE_DIR/pwd"',
        'cat > "$CAPTURE_DIR/stdin"',
        "",
      ].join("\n"),
    );
    await chmod(fakeCodex, 0o755);

    try {
      const summary = await polycastRunnerBuild({
        dir: definitions,
        out,
        targets: ["codex-cli"],
      });
      const wrapper = join(out, summary.files[0] ?? "");
      const result = spawnSync(wrapper, passArgument ? [nested] : [], {
        cwd: nested,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          CAPTURE_DIR: capture,
        },
      });
      expect(result.status).toBe(0);
      const gitRoot = spawnSync("git", ["-C", nested, "rev-parse", "--show-toplevel"], {
        encoding: "utf8",
      }).stdout.trim();
      expect(await readFile(join(capture, "args"), "utf8")).toBe(`exec\n--cd\n${gitRoot}\n-\n`);
      expect(await readFile(join(capture, "pwd"), "utf8")).toBe(`${await realpath(nested)}\n`);
      expect(await readFile(join(capture, "stdin"), "utf8")).toBe("Review the current worktree.\n");
      const args = await readFile(join(capture, "args"), "utf8");
      for (const forbidden of [
        "--sandbox",
        "--model",
        "--profile",
        "--config",
        "--approval-policy",
      ]) {
        expect(args).not.toContain(forbidden);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects extra arguments before invoking Codex", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-codex-extra-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    const repo = join(root, "repo");
    await Promise.all([mkdir(definitions), mkdir(repo)]);
    await writeRunnerModule(definitions, "runner.ts", runOnlySample);
    expect(spawnSync("git", ["init", "-q", repo]).status).toBe(0);
    try {
      const summary = await polycastRunnerBuild({
        dir: definitions,
        out,
        targets: ["codex-cli"],
      });
      const result = spawnSync(join(out, summary.files[0] ?? ""), [repo, repo], {
        encoding: "utf8",
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("usage: review-worktree [worktree]");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects a non-Git directory before invoking Codex", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-codex-nongit-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    const candidate = join(root, "not-git");
    await Promise.all([mkdir(definitions), mkdir(candidate)]);
    await writeRunnerModule(definitions, "runner.ts", runOnlySample);
    try {
      const summary = await polycastRunnerBuild({
        dir: definitions,
        out,
        targets: ["codex-cli"],
      });
      const result = spawnSync(join(out, summary.files[0] ?? ""), [candidate], {
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`not a Git worktree: ${candidate}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects a missing prompt file before invoking Codex", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-codex-missing-prompt-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    const repo = join(root, "repo");
    await Promise.all([mkdir(definitions), mkdir(repo)]);
    await writeRunnerModule(definitions, "runner.ts", runOnlySample);
    expect(spawnSync("git", ["init", "-q", repo]).status).toBe(0);
    try {
      const summary = await polycastRunnerBuild({
        dir: definitions,
        out,
        targets: ["codex-cli"],
      });
      const wrapper = join(out, summary.files[0] ?? "");
      const prompt = join(out, summary.files[1] ?? "");
      await rm(prompt);
      const result = spawnSync(wrapper, [repo], { encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing prompt file");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("runner API", () => {
  test("lists and builds the committed runner for both targets", async () => {
    const out = await mkdtemp(join(tmpdir(), "polycast-runner-build-"));
    try {
      const entries = await polycastRunnerList("runners");
      expect(entries).toEqual([
        {
          id: "polycast.worktree-review",
          title: "Worktree review",
          commands: ["review-worktree"],
          targets: [
            { target: "orca-plugin", status: "supported" },
            { target: "codex-cli", status: "supported" },
          ],
          warnings: [],
        },
      ]);
      const summary = await polycastRunnerBuild({
        dir: "runners",
        out,
        targets: ["orca-plugin", "codex-cli"],
      });
      expect(summary.files).toEqual([
        "orca-plugin/polycast.worktree-review/orca-plugin.json",
        "orca-plugin/polycast.worktree-review/main.mjs",
        "codex-cli/polycast.worktree-review/review-worktree",
        "codex-cli/polycast.worktree-review/review-worktree.prompt.txt",
        "codex-cli/polycast.worktree-review/runner.json",
      ]);
      expect(summary.results.map((result) => result.status)).toEqual(["supported", "supported"]);
      expect(await readFile(join(out, summary.files[0] ?? ""), "utf8")).toContain(
        '"manifestVersion": 1',
      );
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  test("an implicit build reports incompatible targets as skipped", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-runner-skip-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    await mkdir(definitions);
    await writeRunnerModule(definitions, "runner.ts", sample);
    try {
      const summary = await polycastRunnerBuild({ dir: definitions, out });
      expect(summary.results).toEqual([
        {
          runner: "example.review-prompts",
          target: "orca-plugin",
          status: "supported",
          files: [
            "orca-plugin/example.review-prompts/orca-plugin.json",
            "orca-plugin/example.review-prompts/main.mjs",
          ],
        },
        {
          runner: "example.review-prompts",
          target: "codex-cli",
          status: "skipped",
          files: [],
          reason: 'command "draft-plan" uses mode "stage", which codex-cli cannot represent',
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test.each([
    ["unknown target", ["unknown"], "unknown runner target"],
    ["empty target selection", [], "at least one runner target"],
    ["duplicate target", ["codex-cli", "codex-cli"], "duplicate runner target"],
  ])("rejects %s before creating output", async (_label, targets, message) => {
    const root = await mkdtemp(join(tmpdir(), "polycast-runner-targets-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    await mkdir(definitions);
    await writeRunnerModule(definitions, "runner.ts", runOnlySample);
    try {
      await expect(polycastRunnerBuild({ dir: definitions, out, targets })).rejects.toThrow(
        message,
      );
      await expectNoDirectory(out);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects an explicit incompatible target before creating output", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-runner-incompatible-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    await mkdir(definitions);
    await writeRunnerModule(definitions, "runner.ts", sample);
    try {
      await expect(
        polycastRunnerBuild({ dir: definitions, out, targets: ["codex-cli"] }),
      ).rejects.toThrow("incompatible runner target selection");
      await expectNoDirectory(out);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects explicit Orca output when its target hint is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-runner-no-orca-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    await mkdir(definitions);
    await writeRunnerModule(
      definitions,
      "runner.ts",
      defineRunner({ ...runOnlySample, x: undefined }),
    );
    try {
      await expect(
        polycastRunnerBuild({ dir: definitions, out, targets: ["orca-plugin"] }),
      ).rejects.toThrow("runner has no x.orca-plugin engine hint");
      await expectNoDirectory(out);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test.each([
    ["metadata name", ["runner.json"]],
    ["prompt/executable names", ["foo", "foo.prompt.txt"]],
  ])("rejects %s path collisions before creating output", async (_label, commandIds) => {
    const root = await mkdtemp(join(tmpdir(), "polycast-runner-collision-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    await mkdir(definitions);
    const collisionRunner = defineRunner({
      ...runOnlySample,
      commands: commandIds.map(promptCommand),
    });
    await writeRunnerModule(definitions, "runner.ts", collisionRunner);
    try {
      await expect(
        polycastRunnerBuild({ dir: definitions, out, targets: ["codex-cli"] }),
      ).rejects.toThrow("duplicate emitted runner path");
      await expectNoDirectory(out);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("sets executable mode on fresh and overwritten wrappers", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-runner-mode-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    await mkdir(definitions);
    await writeRunnerModule(definitions, "runner.ts", runOnlySample);
    try {
      const first = await polycastRunnerBuild({
        dir: definitions,
        out,
        targets: ["codex-cli"],
      });
      const wrapper = join(out, first.files[0] ?? "");
      expect((await stat(wrapper)).mode & 0o777).toBe(0o755);
      await chmod(wrapper, 0o644);
      await polycastRunnerBuild({ dir: definitions, out, targets: ["codex-cli"] });
      expect((await stat(wrapper)).mode & 0o777).toBe(0o755);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("preserves legacy provenance through defineRunner and loadRunners", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-runner-legacy-"));
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
      const loaded = await loadRunners(definitions);
      expect(loaded).toHaveLength(1);
      expect(loaded[0]?.definition.kind).toBe("runner");
      expect(loaded[0]?.definition.commands[0]?.mode).toBe("run");
      expect(loaded[0]?.warnings).toEqual([LEGACY_RUNNER_WARNING]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("validates the whole definition set before writing artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-runner-invalid-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    await mkdir(definitions);
    await writeRunnerModule(definitions, "a-valid.ts", runOnlySample);
    await writeFile(
      join(definitions, "z-invalid.ts"),
      `export default ${JSON.stringify({ ...runOnlySample, id: "../unsafe" })};\n`,
    );
    try {
      await expect(polycastRunnerBuild({ dir: definitions, out })).rejects.toThrow();
      await expectNoDirectory(out);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects duplicate qualified runner IDs before writing artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-runner-duplicate-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    await mkdir(definitions);
    await writeRunnerModule(definitions, "a.ts", runOnlySample);
    await writeRunnerModule(definitions, "b.ts", runOnlySample);
    try {
      await expect(polycastRunnerBuild({ dir: definitions, out })).rejects.toThrow(
        'duplicate runner id "example.review-prompts"',
      );
      await expectNoDirectory(out);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
