import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseCommandDefJson } from "./schema/command-def.ts";
import type { CommandDef } from "./types.ts";

export function defaultCommandsDir(outRoot: string): string {
  if (process.env.POLYCAST_COMMANDS_DIR) {
    return process.env.POLYCAST_COMMANDS_DIR.startsWith("~/")
      ? join(homedir(), process.env.POLYCAST_COMMANDS_DIR.slice(2))
      : resolve(process.env.POLYCAST_COMMANDS_DIR);
  }
  return join(resolve(outRoot), "commands");
}

/**
 * Write the JSON body store.
 *
 * Returns each file name written, relative to `dir`, so callers can report
 * these in a build summary. They are real build output, not a side effect.
 */
export async function writeCommandsJson(
  commands: readonly CommandDef[],
  dir: string,
): Promise<string[]> {
  const root = resolve(dir);
  await mkdir(root, { recursive: true });
  const written: string[] = [];
  for (const cmd of commands) {
    const name = `${cmd.id}.json`;
    await writeFile(join(root, name), `${JSON.stringify(cmd, null, 2)}\n`);
    written.push(name);
  }
  return written;
}

export async function loadCommandJson(id: string, dir: string): Promise<CommandDef> {
  const path = join(resolve(dir), `${id}.json`);
  const raw = await readFile(path, "utf8");
  const cmd = parseCommandDefJson(JSON.parse(raw));
  if (cmd.id !== id) {
    throw new Error(`command id mismatch: expected "${id}", got "${cmd.id}"`);
  }
  return cmd;
}
