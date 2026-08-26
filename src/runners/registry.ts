import { codexCli } from "./codex-cli.ts";
import { orcaPlugin } from "./orca-plugin.ts";
import type { RunnerDef } from "./schema.ts";
import {
  isSafeBuildRelativePath,
  type RunnerEmittedFile,
  type RunnerEmitter,
  type RunnerTargetCompatibility,
} from "./types.ts";

function immutableEmitterTuple<const Emitters extends readonly RunnerEmitter[]>(
  ...emitters: Emitters
): Readonly<Emitters> {
  return Object.freeze(emitters);
}

export const runnerEmitters = immutableEmitterTuple(orcaPlugin, codexCli);

export type RunnerTargetId = (typeof runnerEmitters)[number]["target"];

export function runnerEmitterFor(target: string): (typeof runnerEmitters)[number] | undefined {
  return runnerEmitters.find((emitter) => emitter.target === target);
}

export function runnerTargetCompatibility(
  runner: RunnerDef,
  target: RunnerTargetId,
): RunnerTargetCompatibility {
  const emitter = runnerEmitterFor(target);
  if (!emitter) throw new Error(`unknown runner target: "${target}"`);
  return emitter.compatibility(runner);
}

export function emitRunner(
  runner: RunnerDef,
  target: RunnerTargetId,
): readonly RunnerEmittedFile[] {
  const emitter = runnerEmitterFor(target);
  if (!emitter) throw new Error(`unknown runner target: "${target}"`);
  const compatibility = emitter.compatibility(runner);
  if (compatibility.status === "skipped") {
    throw new Error(`runner target "${target}" is incompatible: ${compatibility.reason}`);
  }
  const files = emitter.emit(runner);
  for (const file of files) {
    if (!isSafeBuildRelativePath(file.path)) {
      throw new Error(`unsafe generated runner path: ${file.path}`);
    }
  }
  return files;
}
