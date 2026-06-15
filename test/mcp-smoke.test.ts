import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("MCP stdio smoke", () => {
  test("polycast_targets returns emitter registry JSON", async () => {
    const transport = new StdioClientTransport({
      command: "bun",
      args: ["run", "src/mcp/server.ts"],
      cwd: process.cwd(),
    });
    const client = new Client({ name: "polycast-mcp-smoke", version: "1.0.0" });
    await client.connect(transport);
    try {
      const result = await client.callTool({ name: "polycast_targets", arguments: {} });
      expect(result.isError).not.toBe(true);
      const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
      const targets = JSON.parse(text) as { target: string }[];
      expect(targets.some((t) => t.target === "raycast-script")).toBe(true);
      expect(targets.length).toBeGreaterThanOrEqual(8);
    } finally {
      await transport.close();
    }
  }, 30_000);
});
