import type { CommandDef } from "./types.ts";

export const DISPATCHER_RUN_PREFIX = [
  "set -euo pipefail",
  'POLYCAST="${POLYCAST_BIN:-polycast}"',
  'COMMANDS="${POLYCAST_COMMANDS_DIR:-$HOME/.polycast/commands}"',
] as const;

function runExec(cmd: CommandDef, extraArgs = '"$@"'): string {
  return `exec "$POLYCAST" run --commands "$COMMANDS" ${cmd.id} ${extraArgs}`;
}

/** Lines that delegate execution to polycast run (no shebang). */
export function dispatcherRunBody(cmd: CommandDef, extraArgs?: string): readonly string[] {
  return [...DISPATCHER_RUN_PREFIX, runExec(cmd, extraArgs)];
}

/** Thin executable stub that delegates to polycast run (agent-cli target). */
export function agentCliShim(cmd: CommandDef): string {
  return ["#!/usr/bin/env bash", ...dispatcherRunBody(cmd), ""].join("\n");
}

/** Full Raycast script with shebang + polycast run delegation. */
export function raycastScriptShim(cmd: CommandDef, shebang = "#!/bin/bash"): string {
  return [shebang, "", ...dispatcherRunBody(cmd), ""].join("\n");
}

/** PopClip script.sh — reads selection from stdin and passes --text to polycast run. */
export function popclipScriptShim(cmd: CommandDef): string {
  return [
    "#!/bin/bash",
    ...DISPATCHER_RUN_PREFIX,
    'TEXT="$(cat)"',
    `exec "$POLYCAST" run --commands "$COMMANDS" ${cmd.id} --text "$TEXT"`,
    "",
  ].join("\n");
}

/** Cherri runShellScript body — text modality (ShortcutInput → stdin). */
export function shortcutsTextShim(cmd: CommandDef): string {
  return [
    ...DISPATCHER_RUN_PREFIX,
    'TEXT="$(cat)"',
    `exec "$POLYCAST" run --commands "$COMMANDS" ${cmd.id} --text "$TEXT"`,
  ].join("\n");
}

/** Cherri runShellScript body — no input. */
export function shortcutsNoneShim(cmd: CommandDef): string {
  return [...DISPATCHER_RUN_PREFIX, runExec(cmd)].join("\n");
}

/** Cherri runShellScript body — args after Cherri prompt() + set -- lines. */
export function shortcutsArgsShim(cmd: CommandDef): string {
  const args = cmd.args ?? [];
  const setLine = `set -- ${args.map((_, i) => `"{@polycast_arg_${i + 1}}"`).join(" ")}`;
  return [...DISPATCHER_RUN_PREFIX, setLine, runExec(cmd, '"$@"')].join("\n");
}

/** Dropzone / Dropover — forward file paths to polycast run. */
export function filesRunShim(cmd: CommandDef): string {
  return ["#!/bin/bash", ...dispatcherRunBody(cmd), ""].join("\n");
}

export const dropzoneRunShim = filesRunShim;

/** Targets whose installed artifacts call polycast run and need the JSON command store. */
export const DISPATCHER_TARGETS = [
  "agent-cli",
  "raycast-script",
  "popclip",
  "dropzone",
  "dropover-script",
  "shortcuts-cherri",
] as const;

export function targetNeedsCommandsStore(target: string): boolean {
  return (DISPATCHER_TARGETS as readonly string[]).includes(target);
}
