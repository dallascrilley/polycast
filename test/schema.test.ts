import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { defineCommand } from "../src/define.ts";
import {
  commandDefJsonSchema,
  commandDefSchema,
  parseCommandDefJson,
} from "../src/schema/command-def.ts";

describe("command-def schema", () => {
  test("committed JSON schema matches zod export", () => {
    const path = resolve("schemas/command-def.schema.json");
    const committed = JSON.parse(readFileSync(path, "utf8"));
    expect(committed).toEqual(commandDefJsonSchema);
  });

  test("accepts a valid CommandDef", () => {
    const cmd = defineCommand({
      id: "schema-test",
      title: "Schema Test",
      description: "valid",
      modality: "text",
      body: { lang: "bash", source: "cat" },
    });
    expect(parseCommandDefJson(cmd).id).toBe("schema-test");
  });

  test("accepts a picker hint on a text arg and rejects it on a dropdown", () => {
    const cmd = defineCommand({
      id: "picker-test",
      title: "Picker Test",
      description: "valid",
      modality: "args",
      args: [{ name: "worktree", optional: true, picker: "orca-worktree" }],
      body: { lang: "bash", source: "cat" },
    });
    expect(parseCommandDefJson(cmd).args?.[0]?.picker).toBe("orca-worktree");
    expect(() =>
      defineCommand({
        ...cmd,
        args: [{ name: "worktree", type: "dropdown", picker: "orca-worktree" }],
      }),
    ).toThrow(/pickers refine text args/);
    expect(() =>
      commandDefSchema.parse({
        ...cmd,
        args: [{ name: "worktree", picker: "not-a-picker" }],
      }),
    ).toThrow();
  });

  test("validates a non-empty, unique target allowlist", () => {
    const cmd = defineCommand({
      id: "snippet-only",
      title: "Snippet Only",
      description: "valid",
      modality: "none",
      body: { lang: "bash", source: "true" },
      targets: ["raycast-snippet"],
    });
    expect(parseCommandDefJson(cmd).targets).toEqual(["raycast-snippet"]);
    expect(() => commandDefSchema.parse({ ...cmd, targets: [] })).toThrow();
    expect(() =>
      commandDefSchema.parse({ ...cmd, targets: ["raycast-snippet", "raycast-snippet"] }),
    ).toThrow();
  });

  test("rejects invalid id and empty body", () => {
    expect(() =>
      commandDefSchema.parse({
        id: "Bad_ID",
        title: "x",
        description: "x",
        modality: "text",
        body: { lang: "bash", source: "   " },
      }),
    ).toThrow();
  });

  test("accepts an exec body and rejects an empty executable", () => {
    const cmd = defineCommand({
      id: "exec-test",
      title: "Exec Test",
      description: "valid",
      modality: "files",
      body: { lang: "exec", executable: "/usr/bin/true" },
    });
    expect(parseCommandDefJson(cmd).body).toEqual({ lang: "exec", executable: "/usr/bin/true" });
    expect(() =>
      commandDefSchema.parse({
        id: "empty-exec",
        title: "x",
        description: "x",
        modality: "files",
        body: { lang: "exec", executable: "" },
      }),
    ).toThrow();
  });

  test("enforces the Toolbox delegation contract", () => {
    const cmd = defineCommand({
      id: "toolbox-knowledge-search",
      title: "Search Toolbox knowledge",
      description: "Delegates without owning Toolbox behavior or receipts.",
      modality: "args",
      args: [{ name: "query" }],
      body: {
        lang: "exec",
        executable: "/verified/toolbox/bin/toolbox",
        args: ["knowledge", "search"],
      },
      delegation: {
        kind: "toolbox",
        contract: "toolbox-polycast-adapter/v1",
        effectClass: "inspect",
        output: "canonical",
      },
    });

    expect(parseCommandDefJson(cmd).delegation).toEqual(cmd.delegation);
    expect(() =>
      defineCommand({
        ...cmd,
        body: { lang: "bash", source: "toolbox knowledge search" },
      }),
    ).toThrow(/requires an exec body/);
    expect(() =>
      commandDefSchema.parse({
        ...cmd,
        body: { lang: "exec", executable: "/verified/toolbox/bin/toolbox" },
      }),
    ).toThrow(/fixed command prefix/);
    expect(() =>
      commandDefSchema.parse({
        ...cmd,
        delegation: { ...cmd.delegation, effectClass: "authorized" },
      }),
    ).toThrow();

    const validateJson = new Ajv2020({ strict: false }).compile(commandDefJsonSchema);
    expect(validateJson(cmd)).toBe(true);
    expect(
      validateJson({
        ...cmd,
        body: { lang: "bash", source: "toolbox knowledge search" },
      }),
    ).toBe(false);
    expect(
      validateJson({
        ...cmd,
        body: { lang: "exec", executable: "/verified/toolbox/bin/toolbox" },
      }),
    ).toBe(false);
  });

  test("requires args when modality is args", () => {
    expect(() =>
      parseCommandDefJson({
        id: "no-args",
        title: "x",
        description: "x",
        modality: "args",
        body: { lang: "bash", source: "true" },
      }),
    ).toThrow(/args/i);
  });
});
