import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseWorktreeOptions } from "../raycast-extension/src/lib/orca.ts";
import { formatRunResult, runArguments } from "../raycast-extension/src/lib/run.ts";
import {
  buildArgv,
  filterRaycastCommands,
  parseStoredCommand,
} from "../raycast-extension/src/lib/store.ts";
import { writeCommandsJson } from "../src/commands-store.ts";
import { defineToolboxCommand, resolveToolboxExecutable } from "../src/toolbox-adapter.ts";

describe("Raycast extension store helpers", () => {
  test("ignore malformed command documents", () => {
    expect(parseStoredCommand("not json")).toBeNull();
    expect(parseStoredCommand(JSON.stringify({ title: "Missing id" }))).toBeNull();
    expect(
      parseStoredCommand(
        JSON.stringify({
          id: "bad-modality",
          title: "Bad modality",
          description: "invalid",
          modality: "unknown",
        }),
      ),
    ).toBeNull();
  });

  test("parse a real-shaped rename-orca-tabs document", () => {
    const command = parseStoredCommand(
      JSON.stringify({
        id: "rename-orca-tabs",
        title: "Rename Orca Tabs",
        description: "Rename terminal tabs in the active Orca workspace.",
        icon: "🏷️",
        modality: "args",
        args: [
          {
            name: "harness",
            placeholder: "harness (default: pi)",
            optional: true,
            type: "dropdown",
            data: [
              { title: "Pi", value: "pi" },
              { title: "Preview (no agent)", value: "print" },
            ],
          },
          {
            name: "worktree",
            placeholder: "worktree (default: cwd)",
            optional: true,
            picker: "orca-worktree",
          },
        ],
        body: { lang: "bash", source: "printf '%s' \"$@\"" },
        x: { raycast: { mode: "fullOutput" } },
      }),
    );

    expect(command).toMatchObject({
      id: "rename-orca-tabs",
      title: "Rename Orca Tabs",
      modality: "args",
      args: [
        { name: "harness", type: "dropdown" },
        { name: "worktree", picker: "orca-worktree" },
      ],
    });
  });

  test("build argv in declared order and preserve missing positions", () => {
    const args = [{ name: "first" }, { name: "middle" }, { name: "last" }];
    expect(buildArgv(args, { first: "one", last: "three" })).toEqual(["one", "", "three"]);
  });

  test("retain Toolbox metadata and filter commands by Raycast compatibility", () => {
    const visible = parseStoredCommand(
      JSON.stringify({
        id: "toolbox-visible",
        title: "Visible Toolbox",
        description: "inspect",
        modality: "args",
        args: [{ name: "query" }],
        delegation: {
          kind: "toolbox",
          contract: "toolbox-polycast-adapter/v1",
          effectClass: "inspect",
          output: "canonical",
        },
      }),
    );
    const hiddenEffect = parseStoredCommand(
      JSON.stringify({
        id: "toolbox-hidden-effect",
        title: "Hidden Effect",
        description: "mutate without confirmation",
        modality: "none",
        delegation: {
          kind: "toolbox",
          contract: "toolbox-polycast-adapter/v1",
          effectClass: "mutate",
          output: "canonical",
        },
      }),
    );
    const visibleEffect = parseStoredCommand(
      JSON.stringify({
        id: "toolbox-confirmed-effect",
        title: "Confirmed Effect",
        description: "mutate with confirmation",
        modality: "none",
        delegation: {
          kind: "toolbox",
          contract: "toolbox-polycast-adapter/v1",
          effectClass: "mutate",
          output: "canonical",
        },
        x: { raycast: { mode: "fullOutput", needsConfirmation: true } },
      }),
    );
    const hiddenTarget = parseStoredCommand(
      JSON.stringify({
        id: "toolbox-hidden-target",
        title: "Hidden Target",
        description: "agent-only",
        modality: "none",
        targets: ["agent-cli"],
        delegation: {
          kind: "toolbox",
          contract: "toolbox-polycast-adapter/v1",
          effectClass: "inspect",
          output: "canonical",
        },
      }),
    );

    expect(visible).toMatchObject({
      delegation: { kind: "toolbox", effectClass: "inspect", output: "canonical" },
    });
    if (!visible || !hiddenEffect || !visibleEffect || !hiddenTarget) {
      throw new Error("Toolbox catalog fixtures did not parse");
    }
    expect(filterRaycastCommands([hiddenTarget, visibleEffect, hiddenEffect, visible])).toEqual([
      visibleEffect,
      visible,
    ]);
  });

  test("place text input before the separator and preserve argument positions", () => {
    const text = parseStoredCommand(
      JSON.stringify({
        id: "toolbox-text",
        title: "Toolbox text",
        description: "text",
        modality: "text",
      }),
    );
    const args = parseStoredCommand(
      JSON.stringify({
        id: "toolbox-args",
        title: "Toolbox args",
        description: "args",
        modality: "args",
        args: [{ name: "query" }],
      }),
    );
    if (!text || !args) throw new Error("test commands did not parse");

    expect(runArguments(text, "/tmp/commands", ["selected text"])).toEqual([
      "run",
      "--commands",
      "/tmp/commands",
      "toolbox-text",
      "--text",
      "selected text",
      "--",
    ]);
    expect(runArguments(args, "/tmp/commands", ["literal --"])).toEqual([
      "run",
      "--commands",
      "/tmp/commands",
      "toolbox-args",
      "--",
      "literal --",
    ]);
  });

  test("renders canonical result and failure status without rewriting output", () => {
    const success = '{"result":"canonical","receipt":"toolbox://receipt/success"}\n';
    const failure = '{"result":"failed","receipt":"toolbox://receipt/failure"}\n';

    expect(formatRunResult(success, 0)).toContain("### Completed");
    expect(formatRunResult(success, 0)).toContain(success);
    expect(formatRunResult(failure, 17)).toContain("### Failed (exit code 17)");
    expect(formatRunResult(failure, 17)).toContain("toolbox://receipt/failure");
  });
});

describe("Raycast Toolbox dispatch harness", () => {
  test("executes through the canonical Toolbox path and preserves success and failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-raycast-toolbox-"));
    const toolbox = join(root, "bin", "toolbox");
    const commands = join(root, "commands");
    await mkdir(join(root, "bin"));
    await writeFile(
      toolbox,
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${3:-}" == "fail" ]]; then
  printf '%s\\n' '{"result":"failed","receipt":"toolbox://receipt/failure"}'
  printf '%s\\n' 'canonical failure' >&2
  exit 17
fi
printf '%s\\n' '{"result":"canonical","receipt":"toolbox://receipt/success"}'
printf '%s\\n' 'canonical warning' >&2
`,
    );
    await chmod(toolbox, 0o755);

    try {
      const command = defineToolboxCommand({
        id: "toolbox-raycast-fixture",
        title: "Toolbox Raycast fixture",
        description: "dispatch fixture",
        executable: resolveToolboxExecutable(toolbox),
        fixedArgv: ["knowledge", "search"],
        modality: "args",
        args: [{ name: "query" }],
        effectClass: "inspect",
        output: "canonical",
      });
      await writeCommandsJson([command], commands);
      const stored = parseStoredCommand(JSON.stringify(command));
      if (!stored) throw new Error("fixture command did not parse");

      const invoke = (query: string) =>
        spawnSync("bun", ["run", "src/cli.ts", ...runArguments(stored, commands, [query])], {
          cwd: process.cwd(),
          encoding: "utf8",
        });

      const success = invoke("success");
      expect(success.status).toBe(0);
      expect(success.stdout).toBe('{"result":"canonical","receipt":"toolbox://receipt/success"}\n');
      expect(success.stderr).toBe("canonical warning\n");

      const failure = invoke("fail");
      expect(failure.status).toBe(17);
      expect(failure.stdout).toBe('{"result":"failed","receipt":"toolbox://receipt/failure"}\n');
      expect(failure.stderr).toBe("canonical failure\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("Raycast extension Orca helpers", () => {
  test("filter archived worktrees, sort by activity, and strip refs/heads", () => {
    const options = parseWorktreeOptions(
      JSON.stringify({
        ok: true,
        result: {
          worktrees: [
            {
              displayName: "Older",
              path: "/work/older",
              branch: "refs/heads/feature/older",
              isArchived: false,
              lastActivityAt: 10,
            },
            {
              displayName: "Newest",
              path: "/work/newest",
              branch: "refs/heads/feature/newest",
              isArchived: false,
              lastActivityAt: 30,
            },
            {
              displayName: "Archived",
              path: "/work/archived",
              branch: "refs/heads/feature/archived",
              isArchived: true,
              lastActivityAt: 100,
            },
            { path: "/work/no-date", isArchived: false },
          ],
        },
      }),
    );

    expect(options.map((option) => option.title)).toEqual(["Newest", "Older", "/work/no-date"]);
    expect(options[0]).toMatchObject({
      value: "path:/work/newest",
      subtitle: "feature/newest",
    });
    expect(options[0]?.keywords).toEqual(
      expect.arrayContaining(["feature/newest", "feature", "newest", "work", "newest"]),
    );
    expect(options.some((option) => option.title === "Archived")).toBe(false);
  });

  test("return no options for malformed or unsuccessful Orca output", () => {
    expect(parseWorktreeOptions("not json")).toEqual([]);
    expect(parseWorktreeOptions(JSON.stringify({ ok: false, result: { worktrees: [] } }))).toEqual(
      [],
    );
  });
});
