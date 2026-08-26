import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadRunners, qualifiedRunnerId } from "./runners/load.ts";
import {
  emitRunner,
  type RunnerTargetId,
  runnerEmitterFor,
  runnerEmitters,
  runnerTargetCompatibility,
} from "./runners/registry.ts";
import type { RunnerEmittedFile, RunnerTargetCompatibility } from "./runners/types.ts";

export interface RunnerBuildOptions {
  readonly dir?: string;
  readonly out?: string;
  readonly targets?: readonly string[];
}

export interface RunnerWarning {
  readonly source: string;
  readonly message: string;
}

export interface RunnerListEntry {
  readonly id: string;
  readonly title: string;
  readonly commands: readonly string[];
  readonly targets: readonly ({ readonly target: RunnerTargetId } & RunnerTargetCompatibility)[];
  readonly warnings: readonly RunnerWarning[];
}

export interface RunnerTargetEntry {
  readonly target: RunnerTargetId;
}

export type RunnerBuildTargetResult =
  | {
      readonly runner: string;
      readonly target: RunnerTargetId;
      readonly status: "supported";
      readonly files: readonly string[];
    }
  | {
      readonly runner: string;
      readonly target: RunnerTargetId;
      readonly status: "skipped";
      readonly files: readonly [];
      readonly reason: string;
    };

export interface RunnerBuildSummary {
  readonly outRoot: string;
  readonly written: number;
  readonly files: readonly string[];
  readonly results: readonly RunnerBuildTargetResult[];
  readonly warnings: readonly RunnerWarning[];
}

function selectedTargets(requested: readonly string[] | undefined): readonly RunnerTargetId[] {
  if (requested === undefined) return runnerEmitters.map((emitter) => emitter.target);
  if (requested.length === 0) throw new Error("at least one runner target must be selected");

  const selected: RunnerTargetId[] = [];
  const seen = new Set<string>();
  for (const target of requested) {
    if (seen.has(target)) throw new Error(`duplicate runner target: "${target}"`);
    seen.add(target);
    const emitter = runnerEmitterFor(target);
    if (!emitter) throw new Error(`unknown runner target: "${target}"`);
    selected.push(emitter.target);
  }
  return selected;
}

function warningRows(source: string, warnings: readonly string[]): readonly RunnerWarning[] {
  return warnings.map((message) => ({ source, message }));
}

export async function polycastRunnerList(dir = "runners"): Promise<RunnerListEntry[]> {
  const runners = await loadRunners(dir);
  return runners.map(({ definition, source, warnings }) => ({
    id: qualifiedRunnerId(definition),
    title: definition.title,
    commands: definition.commands.map((command) => command.id),
    targets: runnerEmitters.map((emitter) => ({
      target: emitter.target,
      ...emitter.compatibility(definition),
    })),
    warnings: warningRows(source, warnings),
  }));
}

export function polycastRunnerTargets(): readonly RunnerTargetEntry[] {
  return runnerEmitters.map((emitter) => ({ target: emitter.target }));
}

interface PlannedFile {
  readonly file: RunnerEmittedFile;
  readonly owner: string;
}

function assertUniqueEmittedPaths(files: readonly PlannedFile[]): void {
  const ownersByPath = new Map<string, string>();
  for (const { file, owner } of files) {
    const previousOwner = ownersByPath.get(file.path);
    if (previousOwner) {
      throw new Error(
        `duplicate emitted runner path "${file.path}" from ${previousOwner} and ${owner}`,
      );
    }
    ownersByPath.set(file.path, owner);
  }
}

async function writeEmittedFile(outRoot: string, file: RunnerEmittedFile): Promise<void> {
  const destination = join(outRoot, file.path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, file.contents);
  if (file.mode !== undefined) await chmod(destination, file.mode);
}

export async function polycastRunnerBuild(
  options: RunnerBuildOptions = {},
): Promise<RunnerBuildSummary> {
  const runners = await loadRunners(options.dir ?? "runners");
  const targets = selectedTargets(options.targets);
  const explicitTargets = options.targets !== undefined;
  const plannedFiles: PlannedFile[] = [];
  const results: RunnerBuildTargetResult[] = [];
  const incompatibilities: string[] = [];

  for (const { definition } of runners) {
    const runnerId = qualifiedRunnerId(definition);
    for (const target of targets) {
      const compatibility = runnerTargetCompatibility(definition, target);
      if (compatibility.status === "skipped") {
        results.push({
          runner: runnerId,
          target,
          status: "skipped",
          files: [],
          reason: compatibility.reason,
        });
        if (explicitTargets) {
          incompatibilities.push(`${runnerId} -> ${target}: ${compatibility.reason}`);
        }
        continue;
      }

      const files = emitRunner(definition, target);
      results.push({
        runner: runnerId,
        target,
        status: "supported",
        files: files.map((file) => file.path),
      });
      plannedFiles.push(...files.map((file) => ({ file, owner: `${runnerId} target ${target}` })));
    }
  }

  if (incompatibilities.length > 0) {
    throw new Error(`incompatible runner target selection:\n${incompatibilities.join("\n")}`);
  }
  assertUniqueEmittedPaths(plannedFiles);

  const outRoot = resolve(options.out ?? "build");
  for (const { file } of plannedFiles) await writeEmittedFile(outRoot, file);

  return {
    outRoot,
    written: plannedFiles.length,
    files: plannedFiles.map(({ file }) => file.path),
    results,
    warnings: runners.flatMap(({ source, warnings }) => warningRows(source, warnings)),
  };
}
