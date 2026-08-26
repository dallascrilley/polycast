import { parseRunnerDefWithWarnings, type RunnerDef, type RunnerDefInput } from "./schema.ts";

const legacyNormalizedRunnerDefs = new WeakSet<object>();

/** Type-check and validate a runner definition at its authoring boundary. */
export function defineRunner(runner: RunnerDefInput): RunnerDef {
  const parsed = parseRunnerDefWithWarnings(runner);
  if (parsed.warnings.length > 0) legacyNormalizedRunnerDefs.add(parsed.runner);
  return parsed.runner;
}

export function wasLegacyRunnerDef(runner: object): boolean {
  return legacyNormalizedRunnerDefs.has(runner);
}
