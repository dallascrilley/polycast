import type { StoredCommand } from "./store";

export function runArguments(
  command: StoredCommand,
  commandsDir: string,
  argv: readonly string[],
): string[] {
  const args = ["run", "--commands", commandsDir, command.id];
  if (command.modality === "text") {
    return [...args, "--text", argv[0] ?? "", "--"];
  }
  return [...args, "--", ...argv];
}

export function formatRunResult(output: string, exitCode: number | null): string {
  const status =
    exitCode === null ? "Running" : exitCode === 0 ? "Completed" : `Failed (exit code ${exitCode})`;
  const outputBody = output || (exitCode === null ? "Waiting for output..." : "(no output)");
  return `### ${status}\n\n\`\`\`text\n${outputBody}\n\`\`\``;
}
