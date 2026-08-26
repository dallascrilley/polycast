import { posix } from "node:path";
import type { RunnerDef } from "./schema.ts";

export interface RunnerEmittedFile {
  readonly path: string;
  readonly contents: string;
  readonly mode?: number;
}

export type RunnerTargetCompatibility =
  | { readonly status: "supported" }
  | { readonly status: "skipped"; readonly reason: string };

export interface RunnerEmitter<Target extends string = string> {
  readonly target: Target;
  compatibility(runner: RunnerDef): RunnerTargetCompatibility;
  emit(runner: RunnerDef): readonly RunnerEmittedFile[];
}

export function isSafeBuildRelativePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes("\0") &&
    !path.includes("\\") &&
    !posix.isAbsolute(path) &&
    path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}
