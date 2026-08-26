import { parseRunnerDef, type RunnerDef } from "./schema.ts";

/** Type-check and validate a runner definition at its authoring boundary. */
export function defineRunner(runner: RunnerDef): RunnerDef {
  return parseRunnerDef(runner);
}
