import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { POLYCAST_VERSION } from "../src/constants.ts";
import {
  LEGACY_RUNNER_WARNING,
  parseRunnerDefWithWarnings,
  type RunnerDef,
  type RunnerDefInput,
  runnerDefJsonSchema,
  runnerDefSchema,
  type TerminalPromptRunnerCommand,
} from "../src/runners/schema.ts";

const validRunner = {
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
  ],
  x: { "orca-plugin": { engine: ">=1.4.188" } },
} satisfies RunnerDef;

const compatibleLegacyCommand = {
  kind: "terminal-prompt",
  id: "review-worktree",
  title: "Review worktree",
  context: "worktree",
  prompt: "Review the current worktree.",
  enter: "submit",
} satisfies TerminalPromptRunnerCommand;

const legacyRunner = {
  kind: "orca-plugin",
  id: "review-prompts",
  publisher: "example",
  title: "Review prompts",
  description: "Generic prompts for reviewing a worktree.",
  version: POLYCAST_VERSION,
  engine: ">=1.4.188",
  commands: [compatibleLegacyCommand],
} satisfies RunnerDefInput;

describe("runner-def schema", () => {
  test("committed JSON schema matches the canonical zod export", async () => {
    const committed = JSON.parse(await readFile("schemas/runner-def.schema.json", "utf8"));
    expect(committed).toEqual(runnerDefJsonSchema);
  });

  test("accepts the canonical target-neutral runner contract", () => {
    expect(runnerDefSchema.parse(validRunner)).toEqual(validRunner);
  });

  test("normalizes the legacy Orca contract with a deprecation warning", () => {
    expect(parseRunnerDefWithWarnings(legacyRunner)).toEqual({
      runner: validRunner,
      warnings: [LEGACY_RUNNER_WARNING],
    });
  });

  test("keeps the legacy terminal prompt command type available through 0.2", () => {
    expect(compatibleLegacyCommand.kind).toBe("terminal-prompt");
  });

  test.each([
    ["unknown runner field", { ...validRunner, source: "export default () => {}" }],
    [
      "unknown command field",
      {
        ...validRunner,
        commands: [{ ...validRunner.commands[0], action: "terminal.new" }],
      },
    ],
    ["unsafe runner id", { ...validRunner, id: "../review-prompts" }],
    ["reserved publisher id", { ...validRunner, publisher: "constructor" }],
    [
      "unsafe command id",
      { ...validRunner, commands: [{ ...validRunner.commands[0], id: "review/worktree" }] },
    ],
    ["invalid engine range", { ...validRunner, x: { "orca-plugin": { engine: "^1.4.188" } } }],
    ["unknown target hint", { ...validRunner, x: { codex: { profile: "default" } } }],
    ["empty prompt", { ...validRunner, commands: [{ ...validRunner.commands[0], prompt: "  " }] }],
    [
      "global context",
      { ...validRunner, commands: [{ ...validRunner.commands[0], context: "global" }] },
    ],
    [
      "legacy mode name",
      { ...validRunner, commands: [{ ...validRunner.commands[0], mode: "submit" }] },
    ],
    [
      "duplicate command id",
      { ...validRunner, commands: [validRunner.commands[0], validRunner.commands[0]] },
    ],
  ])("rejects %s", (_label, candidate) => {
    expect(runnerDefSchema.safeParse(candidate).success).toBe(false);
  });
});
