import { resolve } from "node:path";
import { Glob } from "bun";
import { wasLegacyRunnerDef } from "./define.ts";
import { LEGACY_RUNNER_WARNING, parseRunnerDefWithWarnings, type RunnerDef } from "./schema.ts";

function moduleDefault(module: unknown, file: string): unknown {
  if (typeof module !== "object" || module === null || !("default" in module)) {
    throw new Error(`${file} has no default export`);
  }
  return module.default;
}

export function qualifiedRunnerId(runner: RunnerDef): string {
  return `${runner.publisher}.${runner.id}`;
}

export interface LoadedRunner {
  readonly definition: RunnerDef;
  readonly source: string;
  readonly warnings: readonly string[];
}

/** Load and fully validate every runner before any build output is written. */
export async function loadRunners(dir: string): Promise<LoadedRunner[]> {
  const root = resolve(dir);
  const glob = new Glob("*.ts");
  const runners: LoadedRunner[] = [];
  const seen = new Set<string>();

  for await (const file of glob.scan({ cwd: root, absolute: true })) {
    const moduleValue = moduleDefault(await import(file), file);
    const wasNormalizedByDefineRunner =
      typeof moduleValue === "object" && moduleValue !== null && wasLegacyRunnerDef(moduleValue);
    const parsed = parseRunnerDefWithWarnings(moduleValue);
    const warnings =
      parsed.warnings.length > 0 || wasNormalizedByDefineRunner ? [LEGACY_RUNNER_WARNING] : [];
    const qualifiedId = qualifiedRunnerId(parsed.runner);
    if (seen.has(qualifiedId)) {
      throw new Error(`duplicate runner id "${qualifiedId}" (${file})`);
    }
    seen.add(qualifiedId);
    runners.push({ definition: parsed.runner, source: file, warnings });
  }

  return runners.sort((a, b) =>
    qualifiedRunnerId(a.definition).localeCompare(qualifiedRunnerId(b.definition)),
  );
}
