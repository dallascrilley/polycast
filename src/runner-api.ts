import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadRunners, qualifiedRunnerId } from "./runners/load.ts";
import { emitOrcaPluginBundle, ORCA_PLUGIN_TARGET } from "./runners/orca-plugin.ts";

export interface RunnerBuildOptions {
  readonly dir?: string;
  readonly out?: string;
}

export interface RunnerListEntry {
  readonly id: string;
  readonly title: string;
  readonly target: typeof ORCA_PLUGIN_TARGET;
  readonly commands: readonly string[];
}

export interface RunnerBuildSummary {
  readonly outRoot: string;
  readonly written: number;
  readonly files: readonly string[];
}

export async function polycastRunnerList(dir = "runners"): Promise<RunnerListEntry[]> {
  const runners = await loadRunners(dir);
  return runners.map((runner) => ({
    id: qualifiedRunnerId(runner),
    title: runner.title,
    target: ORCA_PLUGIN_TARGET,
    commands: runner.commands.map((command) => command.id),
  }));
}

export async function polycastRunnerBuild(
  options: RunnerBuildOptions = {},
): Promise<RunnerBuildSummary> {
  // Loading and rendering the whole set first is deliberate. A bad definition
  // cannot leave a partially updated output tree behind.
  const runners = await loadRunners(options.dir ?? "runners");
  const emitted = runners.flatMap((runner) => emitOrcaPluginBundle(runner));
  const outRoot = resolve(options.out ?? "build");

  for (const file of emitted) {
    const destination = join(outRoot, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.contents);
  }

  return {
    outRoot,
    written: emitted.length,
    files: emitted.map((file) => file.path),
  };
}
