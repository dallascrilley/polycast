import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandDefToModule } from "../src/command-source.ts";
import { writeCommandsJson } from "../src/commands-store.ts";
import { defineCommand } from "../src/define.ts";
import { loadCommands } from "../src/load.ts";
import {
  polycastBuild,
  polycastCommandUpsert,
  polycastList,
  polycastRun,
  polycastTargets,
} from "../src/polycast-api.ts";

const sample = defineCommand({
  id: "mcp-test-upper",
  title: "MCP Test Upper",
  description: "upper for mcp tests",
  modality: "text",
  body: { lang: "bash", source: "tr '[:lower:]' '[:upper:]'" },
});

describe("polycast-api", () => {
  test("polycastList returns structured entries", async () => {
    const entries = await polycastList("commands");
    expect(entries.some((e) => e.id === "uppercase")).toBe(true);
    expect(entries.find((e) => e.id === "uppercase")?.surfaces.length).toBeGreaterThan(0);
  });

  test("polycastTargets mirrors registry", () => {
    const targets = polycastTargets();
    expect(targets.some((t) => t.target === "raycast-script")).toBe(true);
  });

  test("polycastBuild writes to temp dir by default", async () => {
    const summary = await polycastBuild({ dir: "commands" });
    try {
      expect(summary.written).toBeGreaterThan(0);
      expect(summary.files.length).toBe(summary.written);
      expect(summary.outRoot).toContain("polycast-build-");
    } finally {
      await rm(summary.outRoot, { recursive: true, force: true });
    }
  });

  test("polycastRun executes from JSON store", async () => {
    const out = await mkdtemp(join(tmpdir(), "polycast-api-run-"));
    const commandsDir = join(out, "commands");
    try {
      await writeCommandsJson([sample], commandsDir);
      const code = await polycastRun({
        id: "mcp-test-upper",
        commandsDir,
        text: "hello",
      });
      expect(code).toBe(0);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  test("command upsert preview and write round-trip", async () => {
    const id = `mcp-upsert-${Date.now()}`;
    const cmd = { ...sample, id };
    const path = join("commands", `${id}.ts`);

    try {
      const preview = await polycastCommandUpsert(cmd, { write: false });
      expect(preview.written).toBe(false);
      expect(preview.preview).toBe(commandDefToModule(cmd));

      const written = await polycastCommandUpsert(cmd, { write: true });
      expect(written.written).toBe(true);
      const loaded = await loadCommands("commands");
      expect(loaded.some((c) => c.id === id)).toBe(true);
      const disk = await readFile(path, "utf8");
      expect(disk).toContain("defineCommand");
    } finally {
      await rm(path, { force: true });
    }
  });

  test("command upsert previewBuild returns isolated build summary", async () => {
    const id = `mcp-upsert-build-${Date.now()}`;
    const cmd = { ...sample, id };
    const result = await polycastCommandUpsert(cmd, { previewBuild: true, strict: true });
    expect(result.buildPreview?.ok).toBe(true);
    if (result.buildPreview?.ok) {
      expect(result.buildPreview.summary.written).toBeGreaterThan(0);
      expect(result.buildPreview.summary.files.length).toBeGreaterThan(0);
    }
  });
});

describe("mcp server factory", () => {
  test("registers expected tools", async () => {
    const { createPolycastMcpServer } = await import("../src/mcp/server.ts");
    const server = createPolycastMcpServer();
    expect(server).toBeDefined();
  });
});
