import type { CommandDef } from "../types.ts";

export function jsonContent(data: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function errorContent(message: string): {
  content: [{ type: "text"; text: string }];
  isError: true;
} {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function toolError(err: unknown): {
  content: [{ type: "text"; text: string }];
  isError: true;
} {
  if (err instanceof Error) return errorContent(err.message);
  return errorContent(String(err));
}

/** Minimal zod input for command upsert; assertValid enforces IR rules. */
export function parseCommandDef(input: unknown): CommandDef {
  if (!input || typeof input !== "object") {
    throw new Error("command must be an object");
  }
  return input as CommandDef;
}
