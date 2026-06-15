import { popclip } from "./emitters/popclip.ts";
import { raycastScript } from "./emitters/raycast-script.ts";
import type { CommandDef, EmittedFile, Emitter } from "./types.ts";

/**
 * The emitter registry. Adding a launcher target is: write an Emitter, add it
 * here. Every existing command instantly gains the new surface — that is the
 * compounding leverage polycast exists for.
 */
export const emitters: readonly Emitter[] = [raycastScript, popclip];

export function emitterFor(target: string): Emitter | undefined {
  return emitters.find((e) => e.target === target);
}

export interface TargetOutput {
  readonly target: string;
  readonly files: readonly EmittedFile[];
  /** True when the emitter produced nothing because the modality is incompatible. */
  readonly skipped: boolean;
}

/** Run one command through every requested emitter (default: all). */
export function emitCommand(
  cmd: CommandDef,
  targets: readonly string[] = emitters.map((e) => e.target),
): TargetOutput[] {
  return targets.map((target) => {
    const emitter = emitterFor(target);
    if (!emitter) throw new Error(`unknown target: "${target}"`);
    const files = emitter.emit(cmd);
    return { target, files, skipped: files.length === 0 };
  });
}
