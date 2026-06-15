import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type TextBlock = { readonly type: "text"; readonly text: string };

function firstTextBlock(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const block = content[0] as TextBlock | undefined;
  return block?.type === "text" ? block.text : "";
}

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
      const targets = JSON.parse(firstTextBlock(result.content)) as { target: string }[];
      expect(targets.some((t) => t.target === "raycast-script")).toBe(true);
      expect(targets.length).toBeGreaterThanOrEqual(8);
    } finally {
      await transport.close();
    }
  }, 30_000);
});
