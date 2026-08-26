import { qualifiedRunnerId } from "./load.ts";
import type { RunnerDef, RunnerPromptCommand } from "./schema.ts";
import type { RunnerEmittedFile, RunnerEmitter } from "./types.ts";

export const ORCA_PLUGIN_TARGET = "orca-plugin";
export const ORCA_PLUGIN_MANIFEST = "orca-plugin.json";
export const ORCA_PLUGIN_MAIN = "main.mjs";

function workerHandler(command: RunnerPromptCommand): string {
  const id = JSON.stringify(command.id);
  const prompt = JSON.stringify(command.prompt);
  const enter = command.mode === "run";

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
  const options = runner.x?.[ORCA_PLUGIN_TARGET];
  if (!options) throw new Error(`${qualifiedRunnerId(runner)} has no Orca engine hint`);

  const manifest = {
    manifestVersion: 1,
    id: runner.id,
    publisher: runner.publisher,
    name: runner.title,
    version: runner.version,
    ...(runner.description === undefined ? {} : { description: runner.description }),
    engines: { orca: options.engine },
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

export function emitOrcaPluginBundle(runner: RunnerDef): readonly RunnerEmittedFile[] {
  const root = `${ORCA_PLUGIN_TARGET}/${qualifiedRunnerId(runner)}`;
  return [
    { path: `${root}/${ORCA_PLUGIN_MANIFEST}`, contents: renderOrcaPluginManifest(runner) },
    { path: `${root}/${ORCA_PLUGIN_MAIN}`, contents: renderOrcaPluginWorker(runner) },
  ];
}

export const orcaPlugin = {
  target: ORCA_PLUGIN_TARGET,
  compatibility(runner) {
    return runner.x?.[ORCA_PLUGIN_TARGET]
      ? { status: "supported" }
      : { status: "skipped", reason: "runner has no x.orca-plugin engine hint" };
  },
  emit: emitOrcaPluginBundle,
} satisfies RunnerEmitter<typeof ORCA_PLUGIN_TARGET>;
