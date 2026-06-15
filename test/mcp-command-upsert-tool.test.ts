import { describe, expect, test } from "bun:test";
import {
  COMMAND_DEF_SCHEMA_REL,
  polycastCommandUpsertDescription,
} from "../src/mcp/command-upsert-tool.ts";

describe("polycast_command_upsert tool description", () => {
  test("references committed JSON Schema path", () => {
    const description = polycastCommandUpsertDescription();
    expect(description).toContain(COMMAND_DEF_SCHEMA_REL);
    expect(description).toContain("Draft 2020-12");
  });
});
