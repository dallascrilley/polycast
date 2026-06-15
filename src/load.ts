import { resolve } from "node:path";
import { Glob } from "bun";
import { assertValid } from "./define.ts";
import type { CommandDef } from "./types.ts";

/**
 * Load every command definition from a directory of `*.ts` modules, each
 * default-exporting a CommandDef. Ids must be unique across the set.
 */
export async function loadCommands(dir: string): Promise<CommandDef[]> {
  const root = resolve(dir);
  const glob = new Glob("*.ts");
  const commands: CommandDef[] = [];
  const seen = new Set<string>();

  for await (const file of glob.scan({ cwd: root, absolute: true })) {
    const mod = (await import(file)) as { default?: CommandDef };
    const cmd = mod.default;
    if (!cmd) throw new Error(`${file} has no default export`);
    assertValid(cmd);
    if (seen.has(cmd.id)) {
      throw new Error(`duplicate command id "${cmd.id}" (${file})`);
    }
    seen.add(cmd.id);
    commands.push(cmd);
  }

  return commands.sort((a, b) => a.id.localeCompare(b.id));
}
