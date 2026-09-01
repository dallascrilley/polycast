import type { CommandDef } from "./types.ts";

/**
 * Identity helper that gives editors type-checking and autocomplete when
 * authoring a command file. A command module's default export is a CommandDef.
 *
 *   // commands/uppercase.ts
 *   import { defineCommand } from "../src/define.ts";
 *   export default defineCommand({ id: "uppercase", ... });
 */
export function defineCommand(cmd: CommandDef): CommandDef {
  assertValid(cmd);
  return cmd;
}

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Cheap structural validation so authoring errors fail loudly, not silently. */
export function assertValid(cmd: CommandDef): void {
  if (!ID_RE.test(cmd.id)) {
    throw new Error(`command id must be kebab-case: "${cmd.id}"`);
  }
  if (!cmd.title.trim()) {
    throw new Error(`command "${cmd.id}" needs a title`);
  }
  if (cmd.targets?.length === 0) {
    throw new Error(`command "${cmd.id}" has an empty target allowlist`);
  }
  if (cmd.targets && new Set(cmd.targets).size !== cmd.targets.length) {
    throw new Error(`command "${cmd.id}" has duplicate targets`);
  }
  if (cmd.modality === "args" && (!cmd.args || cmd.args.length === 0)) {
    throw new Error(`command "${cmd.id}" has modality "args" but no args`);
  }
  for (const arg of cmd.args ?? []) {
    if (arg.picker && arg.type && arg.type !== "text") {
      throw new Error(
        `command "${cmd.id}" arg "${arg.name}" pairs a picker with type "${arg.type}"; pickers refine text args`,
      );
    }
  }
  if (cmd.body.lang === "exec") {
    if (!cmd.body.executable.trim()) {
      throw new Error(`command "${cmd.id}" has an empty executable`);
    }
  } else if (!cmd.body.source.trim()) {
    throw new Error(`command "${cmd.id}" has an empty body`);
  }
}
