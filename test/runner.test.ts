import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { polycastRunnerBuild, polycastRunnerList } from "../src/runner-api.ts";
import { defineRunner } from "../src/runners/define.ts";
import {
  emitOrcaPluginBundle,
  renderOrcaPluginManifest,
  renderOrcaPluginWorker,
} from "../src/runners/orca-plugin.ts";

const sample = defineRunner({
  kind: "orca-plugin",
  id: "review-prompts",
  publisher: "example",
  title: "Review prompts",
  description: "Generic prompts for reviewing a worktree.",
  version: "0.1.0",
  engine: ">=1.4.188",
  commands: [
    {
      kind: "terminal-prompt",
      id: "review-worktree",
      title: "Review worktree",
      context: "worktree",
      prompt: "Review the current worktree.",
      enter: "submit",
    },
    {
      kind: "terminal-prompt",
      id: "draft-plan",
      title: "Draft plan",
      context: "worktree",
      prompt: "Draft a plan for the current worktree.",
      enter: "insert",
    },
  ],
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

  test("manifest has only worker commands and the exact required capabilities", () => {
    const manifest = JSON.parse(renderOrcaPluginManifest(sample));
    expect(manifest).toEqual({
      manifestVersion: 1,
      id: "review-prompts",
      publisher: "example",
      name: "Review prompts",
      version: "0.1.0",
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

  test("sends the prompt to the only explicit terminal", async () => {
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

  test("inserts without pressing Enter when the author selects insert", async () => {
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

describe("runner API", () => {
  test("lists and builds the committed generic example", async () => {
    const out = await mkdtemp(join(tmpdir(), "polycast-runner-build-"));
    try {
      const entries = await polycastRunnerList("runners");
      expect(entries).toEqual([
        {
          id: "polycast.worktree-review",
          title: "Worktree review",
          target: "orca-plugin",
          commands: ["review-worktree"],
        },
      ]);
      const summary = await polycastRunnerBuild({ dir: "runners", out });
      expect(summary.files).toEqual([
        "orca-plugin/polycast.worktree-review/orca-plugin.json",
        "orca-plugin/polycast.worktree-review/main.mjs",
      ]);
      expect(await readFile(join(out, summary.files[0] ?? ""), "utf8")).toContain(
        '"manifestVersion": 1',
      );
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  test("validates the whole definition set before writing artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-runner-invalid-"));
    const definitions = join(root, "runners");
    const out = join(root, "build");
    await mkdir(definitions);
    await writeFile(join(definitions, "a-valid.ts"), `export default ${JSON.stringify(sample)};\n`);
    await writeFile(
      join(definitions, "z-invalid.ts"),
      `export default ${JSON.stringify({ ...sample, id: "../unsafe" })};\n`,
    );

    try {
      await expect(polycastRunnerBuild({ dir: definitions, out })).rejects.toThrow();
      await expect(readdir(out)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
