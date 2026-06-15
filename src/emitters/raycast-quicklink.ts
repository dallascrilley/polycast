import type { CommandDef, EmittedFile, Emitter } from "../types.ts";

function quicklinkEntry(cmd: CommandDef): Record<string, string> | undefined {
  const ql = cmd.x?.raycast?.quicklink;
  if (!ql?.link) return undefined;

  let link = ql.link;
  if (cmd.modality === "args" && cmd.args) {
    for (const arg of cmd.args) {
      link = link.replace(`{${arg.name}}`, `{argument name="${arg.placeholder ?? arg.name}"}`);
    }
  }

  const entry: Record<string, string> = { name: cmd.title, link };
  if (ql.openWith) entry.openWith = ql.openWith;
  return entry;
}

export const raycastQuicklink: Emitter = {
  target: "raycast-quicklink",
  supports: ["none", "args"],

  emit(): EmittedFile[] {
    return [];
  },

  emitCatalog(commands: readonly CommandDef[]): EmittedFile[] {
    const entries = commands
      .map(quicklinkEntry)
      .filter((e): e is Record<string, string> => e != null);
    if (entries.length === 0) return [];
    return [{ path: "quicklinks.json", contents: `${JSON.stringify(entries, null, 2)}\n` }];
  },
};
