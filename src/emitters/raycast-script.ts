import type { CommandDef, EmittedFile, Emitter } from "../types.ts";

const SHEBANG: Record<CommandDef["body"]["lang"], string> = {
  bash: "#!/bin/bash",
  node: "#!/usr/bin/env node",
  applescript: "#!/usr/bin/osascript",
};

/**
 * Emits a Raycast script command: a shebang + `# @raycast.*` comment header
 * followed by the body. Raycast passes typed arguments, so this surface
 * supports the `args` and `none` modalities only.
 *
 * Reference format: raycast/script-commands in the dotfiles repo.
 */
export const raycastScript: Emitter = {
  target: "raycast-script",
  supports: ["args", "none"],

  emit(cmd: CommandDef): EmittedFile[] {
    if (!this.supports.includes(cmd.modality)) return [];

    const lines: string[] = [
      SHEBANG[cmd.body.lang],
      "",
      "# Required parameters:",
      "# @raycast.schemaVersion 1",
      `# @raycast.title ${cmd.title}`,
      `# @raycast.mode ${cmd.x?.raycast?.mode ?? "fullOutput"}`,
      "",
      "# Optional parameters:",
    ];

    if (cmd.icon) lines.push(`# @raycast.icon ${cmd.icon}`);
    if (cmd.x?.raycast?.packageName) {
      lines.push(`# @raycast.packageName ${cmd.x.raycast.packageName}`);
    }
    cmd.args?.forEach((arg, i) => {
      const spec = JSON.stringify({
        type: "text",
        placeholder: arg.placeholder ?? arg.name,
        optional: arg.optional ?? false,
      });
      lines.push(`# @raycast.argument${i + 1} ${spec}`);
    });

    lines.push("", "# Documentation:", `# @raycast.description ${cmd.description}`);
    if (cmd.author) lines.push(`# @raycast.author ${cmd.author}`);

    lines.push("", cmd.body.source.trimEnd(), "");

    return [
      {
        path: `${cmd.id}.sh`,
        contents: lines.join("\n"),
        mode: 0o755,
      },
    ];
  },
};
