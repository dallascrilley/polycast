import type { CommandDef } from "./types.ts";

/** Serialize a CommandDef as a git-friendly commands/*.ts module. */
export function commandDefToModule(cmd: CommandDef): string {
  const payload = JSON.stringify(cmd, null, 2);
  return [
    'import { defineCommand } from "../src/define.ts";',
    "",
    `export default defineCommand(${payload});`,
    "",
  ].join("\n");
}
