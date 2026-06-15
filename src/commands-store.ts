import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { assertValid } from "./define.ts";
import type { CommandDef } from "./types.ts";

export function defaultCommandsDir(outRoot: string): string {
  if (process.env.POLYCAST_COMMANDS_DIR) {
    return process.env.POLYCAST_COMMANDS_DIR.startsWith("~/")
      ? join(homedir(), process.env.POLYCAST_COMMANDS_DIR.slice(2))
      : resolve(process.env.POLYCAST_COMMANDS_DIR);
  }
  return join(resolve(outRoot), "commands");
}

export async function writeCommandsJson(
  commands: readonly CommandDef[],
  dir: string,
): Promise<void> {
  const root = resolve(dir);
  await mkdir(root, { recursive: true });
  for (const cmd of commands) {
    await writeFile(join(root, `${cmd.id}.json`), `${JSON.stringify(cmd, null, 2)}\n`);
  }
}

export async function loadCommandJson(id: string, dir: string): Promise<CommandDef> {
  const path = join(resolve(dir), `${id}.json`);
  const raw = await readFile(path, "utf8");
  const cmd = JSON.parse(raw) as CommandDef;
  assertValid(cmd);
  if (cmd.id !== id) {
    throw new Error(`command id mismatch: expected "${id}", got "${cmd.id}"`);
  }
  return cmd;
}
