import { resolve } from "node:path";
import { Glob } from "bun";
import { parseRunnerDef, type RunnerDef } from "./schema.ts";

function moduleDefault(module: unknown, file: string): unknown {
  if (typeof module !== "object" || module === null || !("default" in module)) {
    throw new Error(`${file} has no default export`);
  }
  return module.default;
}

export function qualifiedRunnerId(runner: RunnerDef): string {
  return `${runner.publisher}.${runner.id}`;
}

/** Load and fully validate every runner before any build output is written. */
export async function loadRunners(dir: string): Promise<RunnerDef[]> {
  const root = resolve(dir);
  const glob = new Glob("*.ts");
  const runners: RunnerDef[] = [];
  const seen = new Set<string>();

  for await (const file of glob.scan({ cwd: root, absolute: true })) {
    const runner = parseRunnerDef(moduleDefault(await import(file), file));
    const qualifiedId = qualifiedRunnerId(runner);
    if (seen.has(qualifiedId)) {
      throw new Error(`duplicate runner id "${qualifiedId}" (${file})`);
    }
    seen.add(qualifiedId);
    runners.push(runner);
  }

  return runners.sort((a, b) => qualifiedRunnerId(a).localeCompare(qualifiedRunnerId(b)));
}
