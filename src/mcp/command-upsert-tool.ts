/** MCP tool copy for polycast_command_upsert — points agents at the committed JSON Schema. */
import { COMMAND_DEF_SCHEMA_REL } from "../schema/command-def.ts";

export { COMMAND_DEF_SCHEMA_REL };

export function polycastCommandUpsertDescription(): string {
  return [
    "Create or preview a commands/<id>.ts module from a CommandDef JSON object.",
    `Full JSON Schema (Draft 2020-12): ${COMMAND_DEF_SCHEMA_REL}.`,
    "Required fields: id (kebab-case), title, description, modality, body.",
    'modality: "text" | "files" | "args" | "none" — args[] required when modality is "args".',
    "body: { lang: bash|node|applescript, source } or { lang: exec, executable, args? }.",
    "Optional: icon, author, x (per-target hints).",
    "write defaults to false (dry-run). previewBuild runs an isolated strict build and returns buildPreview.",
  ].join(" ");
}
