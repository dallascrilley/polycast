import type { CommandDef, EmittedFile, Emitter } from "../types.ts";

export const raycastSnippet: Emitter = {
  target: "raycast-snippet",
  supports: ["none", "text"],

  emit(): EmittedFile[] {
    return [];
  },

  emitCatalog(commands: readonly CommandDef[]): EmittedFile[] {
    const entries = commands
      .filter((c) => c.x?.raycast?.snippet?.text)
      .map((c) => ({
        name: c.title,
        text: c.x?.raycast?.snippet?.text ?? "",
        ...(c.x?.raycast?.snippet?.keyword ? { keyword: c.x.raycast.snippet.keyword } : {}),
      }));

    if (entries.length === 0) return [];
    return [{ path: "snippets.json", contents: `${JSON.stringify(entries, null, 2)}\n` }];
  },
};
