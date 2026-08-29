import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
