import { qualifiedRunnerId } from "./load.ts";
import type { RunnerDef, RunnerPromptCommand } from "./schema.ts";
import type { RunnerEmittedFile, RunnerEmitter } from "./types.ts";

export const CODEX_CLI_TARGET = "codex-cli";
export const CODEX_CLI_METADATA = "runner.json";

function renderCodexWrapper(command: RunnerPromptCommand): string {
  return [
    "#!/bin/bash",
    "set -euo pipefail",
    'if [[ "$#" -gt 1 ]]; then',
    `  echo ${JSON.stringify(`usage: ${command.id} [worktree]`)} >&2`,
    "  exit 2",
    "fi",
    'CANDIDATE="${1:-$PWD}"',
    'if ! GIT_ROOT="$(git -C "$CANDIDATE" rev-parse --show-toplevel 2>/dev/null)"; then',
    `  echo "${command.id}: not a Git worktree: $CANDIDATE" >&2`,
    "  exit 1",
    "fi",
    'SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
    `PROMPT_FILE="$SCRIPT_DIR/${command.id}.prompt.txt"`,
    'if [[ ! -f "$PROMPT_FILE" ]]; then',
    `  echo "${command.id}: missing prompt file: $PROMPT_FILE" >&2`,
    "  exit 1",
    "fi",
    'exec codex exec --cd "$GIT_ROOT" - < "$PROMPT_FILE"',
    "",
  ].join("\n");
}

function renderCodexMetadata(runner: RunnerDef): string {
  const metadata = {
    schemaVersion: 1,
    id: qualifiedRunnerId(runner),
    publisher: runner.publisher,
    runnerId: runner.id,
    title: runner.title,
    ...(runner.description === undefined ? {} : { description: runner.description }),
    version: runner.version,
    commands: runner.commands.map((command) => ({
      id: command.id,
      title: command.title,
      context: command.context,
      mode: command.mode,
      executable: command.id,
      promptFile: `${command.id}.prompt.txt`,
    })),
  };
  return `${JSON.stringify(metadata, null, 2)}\n`;
}

export function emitCodexCliBundle(runner: RunnerDef): readonly RunnerEmittedFile[] {
  const root = `${CODEX_CLI_TARGET}/${qualifiedRunnerId(runner)}`;
  return [
    ...runner.commands.flatMap((command) => [
      { path: `${root}/${command.id}`, contents: renderCodexWrapper(command), mode: 0o755 },
      { path: `${root}/${command.id}.prompt.txt`, contents: `${command.prompt}\n` },
    ]),
    { path: `${root}/${CODEX_CLI_METADATA}`, contents: renderCodexMetadata(runner) },
  ];
}

export const codexCli = {
  target: CODEX_CLI_TARGET,
  compatibility(runner) {
    const staged = runner.commands.find((command) => command.mode === "stage");
    return staged
      ? {
          status: "skipped",
          reason: `command "${staged.id}" uses mode "stage", which codex-cli cannot represent`,
        }
      : { status: "supported" };
  },
  emit: emitCodexCliBundle,
} satisfies RunnerEmitter<typeof CODEX_CLI_TARGET>;
