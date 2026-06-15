#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  polycastApply,
  polycastBuild,
  polycastCommandUpsert,
  polycastList,
  polycastRun,
  polycastTargets,
} from "../polycast-api.ts";
import { jsonContent, parseCommandDef, toolError } from "./response.ts";

const dirSchema = z.string().optional();
const targetsSchema = z.array(z.string()).optional();

export function createPolycastMcpServer(): McpServer {
  const server = new McpServer(
    { name: "polycast", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "polycast_list",
    {
      description:
        "List command definitions and compatible emitter surfaces (same as polycast list).",
      inputSchema: { dir: dirSchema },
    },
    async ({ dir }) => {
      try {
        return jsonContent(await polycastList(dir));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "polycast_targets",
    {
      description: "List emitter targets and supported modalities (same as polycast targets).",
      inputSchema: {},
    },
    async () => jsonContent(polycastTargets()),
  );

  server.registerTool(
    "polycast_build",
    {
      description:
        "Build command artifacts. Defaults to a temp output dir unless out is set. strict fails on validation issues.",
      inputSchema: {
        dir: dirSchema,
        out: z.string().optional(),
        targets: targetsSchema,
        strict: z.boolean().optional(),
      },
    },
    async ({ dir, out, targets, strict }) => {
      try {
        return jsonContent(await polycastBuild({ dir, out, targets, strict }));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "polycast_apply",
    {
      description:
        "Install built artifacts to launcher locations. write defaults to false (dry-run). Requires build output at out (default ./build).",
      inputSchema: {
        dir: dirSchema,
        out: z.string().optional(),
        targets: targetsSchema,
        write: z.boolean().optional(),
      },
    },
    async ({ dir, out, targets, write }) => {
      try {
        return jsonContent(await polycastApply({ dir, out, targets, write }));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "polycast_prune",
    {
      description:
        "Remove polycast-owned install artifacts only (same as polycast apply --prune-only). write defaults to false.",
      inputSchema: {
        out: z.string().optional(),
        targets: targetsSchema,
        write: z.boolean().optional(),
      },
    },
    async ({ out, targets, write }) => {
      try {
        return jsonContent(
          await polycastApply({ out, targets, write, prune: true, pruneOnly: true }),
        );
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "polycast_run",
    {
      description: "Run a command by id from the JSON command store (same as polycast run).",
      inputSchema: {
        id: z.string(),
        commandsDir: z.string().optional(),
        out: z.string().optional(),
        argv: z.array(z.string()).optional(),
        text: z.string().optional(),
      },
    },
    async ({ id, commandsDir, out, argv, text }) => {
      try {
        const exitCode = await polycastRun({ id, commandsDir, out, argv, text });
        return jsonContent({ id, exitCode });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "polycast_command_upsert",
    {
      description:
        "Create or preview a commands/<id>.ts module from a CommandDef JSON object. write defaults to false. previewBuild runs an isolated strict build and returns buildPreview.",
      inputSchema: {
        command: z.record(z.string(), z.unknown()),
        dir: dirSchema,
        write: z.boolean().optional(),
        previewBuild: z.boolean().optional(),
        strict: z.boolean().optional(),
      },
    },
    async ({ command, dir, write, previewBuild, strict }) => {
      try {
        const cmd = parseCommandDef(command);
        return jsonContent(await polycastCommandUpsert(cmd, { dir, write, previewBuild, strict }));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = createPolycastMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
