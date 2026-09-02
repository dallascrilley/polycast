import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

  test("polycastBuild counts every file it writes, body store included", async () => {
    const summary = await polycastBuild({ dir: "commands" });
    try {
      const entries = await readdir(summary.outRoot, { recursive: true, withFileTypes: true });
      const onDisk = entries.filter((e) => e.isFile()).length;
      // The summary is what the CLI prints, so it has to match the build tree.
      expect(summary.written).toBe(onDisk);
      expect(summary.files.length).toBe(summary.written);
      // The JSON body store used to be written without being counted.
      expect(summary.files).toContain("commands/uppercase.json");
    } finally {
      await rm(summary.outRoot, { recursive: true, force: true });
    }
  });

  test("polycastBuild reports each incompatible Toolbox surface with a reason", async () => {
    const out = await mkdtemp(join(tmpdir(), "polycast-toolbox-gate-"));
    const dir = join(out, "commands");
    const cmd = {
      ...sample,
      id: "toolbox-sensitive-test",
      modality: "args" as const,
      args: [{ name: "query" }],
      body: {
        lang: "exec" as const,
        executable: "/verified/toolbox/bin/toolbox",
        args: ["deliver", "pr", "create"],
      },
      delegation: {
        kind: "toolbox" as const,
        contract: "toolbox-polycast-adapter/v1" as const,
        effectClass: "integrate" as const,
        output: "canonical" as const,
      },
    };
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${cmd.id}.ts`),
      `export default ${JSON.stringify(cmd, null, 2)} as const;\n`,
    );
    try {
      const summary = await polycastBuild({ dir, out: join(out, "build") });
      expect(summary.skips).toContainEqual({
        commandId: cmd.id,
        target: "raycast-script",
        reason: 'effect class "integrate" requires x.raycast.needsConfirmation: true',
      });
      expect(summary.files).toContain(`agent-cli/${cmd.id}`);
      expect(summary.files.some((path) => path.startsWith("raycast-script/"))).toBe(false);

      const rejected = await polycastBuild({
        dir,
        out: join(out, "rejected-build"),
        targets: ["raycast-script"],
      });
      expect(rejected.files).not.toContain(`commands/${cmd.id}.json`);
      expect(rejected.skips).toEqual([
        {
          commandId: cmd.id,
          target: "raycast-script",
          reason: 'effect class "integrate" requires x.raycast.needsConfirmation: true',
        },
      ]);
    } finally {
      await rm(out, { recursive: true, force: true });
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
      expect(preview.schemaPath).toBe("schemas/command-def.schema.json");
      expect(preview.preview).toBe(commandDefToModule(cmd));

      const written = await polycastCommandUpsert(cmd, { write: true });
      expect(written.written).toBe(true);
      expect(written.schemaPath).toBe("schemas/command-def.schema.json");
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
