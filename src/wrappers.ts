import type { CommandDef, ScriptLang } from "./types.ts";

const SHEBANG: Record<ScriptLang, string> = {
  bash: "#!/bin/bash",
  node: "#!/usr/bin/env node",
  applescript: "#!/usr/bin/osascript",
};

/** Executable script with modality adapter around the body. */
export function wrappedScript(cmd: CommandDef): string {
  if (cmd.body.lang === "exec") {
    throw new Error(`exec body cannot be wrapped as a script: "${cmd.id}"`);
  }
  const shebang = SHEBANG[cmd.body.lang];
  const body = cmd.body.source.trimEnd();

  switch (cmd.modality) {
    case "text":
      return [shebang, "set -euo pipefail", "{", body, "}", ""].join("\n");

    case "files":
      return [shebang, "set -euo pipefail", body, ""].join("\n");

    case "args":
      return [shebang, "set -euo pipefail", body, ""].join("\n");

    case "none":
      return [shebang, "set -euo pipefail", body, ""].join("\n");
  }
}

/** Escape body for embedding in Cherri single-quoted runShellScript string. */
export function escapeCherriString(source: string): string {
  return source.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
