import type { CommandDef } from "./types.ts";

export interface CommandModuleOptions {
  readonly defineImport?: string;
  readonly header?: readonly string[];
}

/** Serialize a CommandDef as a git-friendly commands/*.ts module. */
export function commandDefToModule(cmd: CommandDef, options: CommandModuleOptions = {}): string {
  const payload = JSON.stringify(cmd, null, 2);
  return [
    ...(options.header ?? []),
    ...(options.header?.length ? [""] : []),
    `import { defineCommand } from ${JSON.stringify(options.defineImport ?? "../src/define.ts")};`,
    "",
    `export default defineCommand(${payload});`,
    "",
  ].join("\n");
}
