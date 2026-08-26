import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { type RunnerDef, runnerDefJsonSchema, runnerDefSchema } from "../src/runners/schema.ts";

const validRunner = {
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
  ],
} satisfies RunnerDef;

describe("runner-def schema", () => {
  test("committed JSON schema matches zod export", async () => {
    const committed = JSON.parse(await readFile("schemas/runner-def.schema.json", "utf8"));
    expect(committed).toEqual(runnerDefJsonSchema);
  });

  test("accepts the terminal-prompt Orca runner contract", () => {
    expect(runnerDefSchema.parse(validRunner)).toEqual(validRunner);
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
    ["unsafe plugin id", { ...validRunner, id: "../review-prompts" }],
    ["reserved publisher id", { ...validRunner, publisher: "constructor" }],
    [
      "unsafe command id",
      { ...validRunner, commands: [{ ...validRunner.commands[0], id: "review/worktree" }] },
    ],
    ["invalid engine range", { ...validRunner, engine: "^1.4.188" }],
    ["empty prompt", { ...validRunner, commands: [{ ...validRunner.commands[0], prompt: "  " }] }],
    [
      "global context",
      { ...validRunner, commands: [{ ...validRunner.commands[0], context: "global" }] },
    ],
    [
      "boolean enter mode",
      { ...validRunner, commands: [{ ...validRunner.commands[0], enter: true }] },
    ],
    [
      "duplicate command id",
      { ...validRunner, commands: [validRunner.commands[0], validRunner.commands[0]] },
    ],
  ])("rejects %s", (_label, candidate) => {
    expect(runnerDefSchema.safeParse(candidate).success).toBe(false);
  });
});
