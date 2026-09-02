import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { MissingPrivateConfig } from "./private-config.ts";

const captureNameSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/**
 * One decompiled third-party App Intent action — a `rawAction(identifier,
 * params)` pair as Cherri's own decompiler would emit it. Recovered by
 * authoring a Shortcut once, by hand, using the target app's native action in
 * the Shortcuts app's own action picker, exporting it, and running
 * `cherri decompile` on the result. Polycast cannot originate this data:
 * Apple does not publish third-party App Intent identifiers, and Cherri's
 * standard library has no built-in wrapper for them. See
 * docs/guides/native-action-capture.md.
 */
const capturedActionSchema = z.object({
  identifier: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});

const captureFileSchema = z.object({
  version: z.literal(1),
  actions: z.record(captureNameSchema, capturedActionSchema),
});

export type CapturedAction = z.infer<typeof capturedActionSchema>;

function defaultCapturePath(): string {
  const configured = process.env.POLYCAST_NATIVE_ACTIONS;
  if (configured) return resolve(configured);
  return join(homedir(), ".config", "polycast", "native-actions.json");
}

/**
 * Load one private, device-captured native action. Command definitions never
 * contain this data. Throws `MissingPrivateConfig` when the capture file or
 * the named action does not exist yet (skip, don't crash the build); any
 * other error (malformed JSON, schema violation) propagates normally.
 */
export function loadCapturedAction(name: string): CapturedAction {
  const capturePath = defaultCapturePath();
  let raw: string;
  try {
    raw = readFileSync(capturePath, "utf8");
  } catch {
    throw new MissingPrivateConfig(
      `native action capture file not found: ${capturePath} (needed for "${name}"); ` +
        "see docs/guides/native-action-capture.md",
    );
  }
  const config = captureFileSchema.parse(JSON.parse(raw));
  const action = config.actions[name];
  if (!action) {
    throw new MissingPrivateConfig(
      `native action not captured: "${name}" (missing from ${capturePath}); ` +
        "see docs/guides/native-action-capture.md",
    );
  }
  return action;
}
