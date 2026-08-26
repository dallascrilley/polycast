import { posix } from "node:path";
import type { RunnerDef, TerminalPromptRunnerCommand } from "./schema.ts";

export const ORCA_PLUGIN_TARGET = "orca-plugin";
export const ORCA_PLUGIN_MANIFEST = "orca-plugin.json";
export const ORCA_PLUGIN_MAIN = "main.mjs";

export interface RunnerEmittedFile {
  readonly path: string;
  readonly contents: string;
}

function workerHandler(command: TerminalPromptRunnerCommand): string {
  const id = JSON.stringify(command.id);
  const prompt = JSON.stringify(command.prompt);
  const enter = command.enter === "submit";

  return [
    `  commands.register(${id}, async () => {`,
    '    const context = await host.call("workspace.readContext");',
    "    if (!context) {",
    `      throw new Error(${JSON.stringify(`${command.id} requires a focused worktree`)});`,
    "    }",
    "    if (context.terminals.length !== 1) {",
    `      throw new Error(${JSON.stringify(`${command.id} requires exactly one terminal; found `)} + context.terminals.length);`,
    "    }",
    '    return host.call("terminal.sendText", {',
    "      terminalId: context.terminals[0].id,",
    `      text: ${prompt},`,
    `      enter: ${enter},`,
    "    });",
    "  });",
  ].join("\n");
}

export function renderOrcaPluginWorker(runner: RunnerDef): string {
  return [
    "export default function activate({ commands, host }) {",
    runner.commands.map(workerHandler).join("\n\n"),
    "}",
    "",
  ].join("\n");
}

export function renderOrcaPluginManifest(runner: RunnerDef): string {
  const manifest = {
    manifestVersion: 1,
    id: runner.id,
    publisher: runner.publisher,
    name: runner.title,
    version: runner.version,
    ...(runner.description === undefined ? {} : { description: runner.description }),
    engines: { orca: runner.engine },
    pluginApi: 1,
    main: ORCA_PLUGIN_MAIN,
    contributes: {
      commands: runner.commands.map((command) => ({
        id: command.id,
        title: command.title,
        context: command.context,
      })),
    },
    capabilities: [{ kind: "workspace:read" }, { kind: "terminal:send" }],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function isSafeBuildRelativePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes("\0") &&
    !path.includes("\\") &&
    !posix.isAbsolute(path) &&
    path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

export function emitOrcaPluginBundle(runner: RunnerDef): readonly RunnerEmittedFile[] {
  const root = `${ORCA_PLUGIN_TARGET}/${runner.publisher}.${runner.id}`;
  const files = [
    { path: `${root}/${ORCA_PLUGIN_MANIFEST}`, contents: renderOrcaPluginManifest(runner) },
    { path: `${root}/${ORCA_PLUGIN_MAIN}`, contents: renderOrcaPluginWorker(runner) },
  ];
  for (const file of files) {
    if (!isSafeBuildRelativePath(file.path)) {
      throw new Error(`unsafe generated runner path: ${file.path}`);
    }
  }
  return files;
}
