import { z } from "zod";

const RUNNER_ID_MAX_LENGTH = 64;
const COMMAND_ID_MAX_LENGTH = 256;
const PROMPT_MAX_LENGTH = 4096;
const RUNNER_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMMAND_ID_RE = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;
const SEMVER_RE =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RESERVED_IDS = new Set(["__proto__", "prototype", "constructor"]);

const runnerIdSchema = z
  .string()
  .max(RUNNER_ID_MAX_LENGTH)
  .regex(RUNNER_ID_RE, "must be kebab-case (a-z, 0-9, dashes)")
  .refine((id) => !RESERVED_IDS.has(id), "must not be a reserved name");

const runnerCommandIdSchema = z
  .string()
  .min(1)
  .max(COMMAND_ID_MAX_LENGTH)
  .regex(COMMAND_ID_RE, "must be a portable command id");

const nonBlankSchema = (label: string, max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value.trim().length > 0, `${label} must be non-empty`);

const engineRangeSchema = z
  .string()
  .max(64)
  .regex(/^>=\d+\.\d+\.\d+$/, 'must be a ">=x.y.z" version range');

const promptCommandSchema = z
  .object({
    kind: z.literal("prompt"),
    id: runnerCommandIdSchema,
    title: nonBlankSchema("title", 256),
    context: z.literal("worktree"),
    prompt: nonBlankSchema("prompt", PROMPT_MAX_LENGTH),
    mode: z.enum(["run", "stage"]),
  })
  .strict();

const legacyTerminalPromptCommandSchema = z
  .object({
    kind: z.literal("terminal-prompt"),
    id: runnerCommandIdSchema,
    title: nonBlankSchema("title", 256),
    context: z.literal("worktree"),
    prompt: nonBlankSchema("prompt", PROMPT_MAX_LENGTH),
    enter: z.enum(["insert", "submit"]),
  })
  .strict();

function addDuplicateCommandIssues(
  commands: readonly { readonly id: string }[],
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, command] of commands.entries()) {
    if (seen.has(command.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["commands", index, "id"],
        message: `duplicate command id: ${command.id}`,
      });
    }
    seen.add(command.id);
  }
}

const canonicalRunnerDefSchema = z
  .object({
    kind: z.literal("runner"),
    id: runnerIdSchema,
    publisher: runnerIdSchema,
    title: nonBlankSchema("title", 256),
    description: z.string().max(4096).optional(),
    version: z.string().regex(SEMVER_RE, "must be semver"),
    commands: z.array(promptCommandSchema).min(1).max(256),
    x: z
      .object({
        "orca-plugin": z.object({ engine: engineRangeSchema }).strict().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((runner, ctx) => addDuplicateCommandIssues(runner.commands, ctx));

const legacyRunnerDefSchema = z
  .object({
    kind: z.literal("orca-plugin"),
    id: runnerIdSchema,
    publisher: runnerIdSchema,
    title: nonBlankSchema("title", 256),
    description: z.string().max(4096).optional(),
    version: z.string().regex(SEMVER_RE, "must be semver"),
    engine: engineRangeSchema,
    commands: z.array(legacyTerminalPromptCommandSchema).min(1).max(256),
  })
  .strict()
  .superRefine((runner, ctx) => addDuplicateCommandIssues(runner.commands, ctx));

/** Canonical public authoring schema. Legacy input is accepted only by parseRunnerDef. */
export const runnerDefSchema = canonicalRunnerDefSchema;

export type RunnerDef = z.infer<typeof runnerDefSchema>;
export type RunnerPromptCommand = RunnerDef["commands"][number];
/** @deprecated Accepted only through the 0.2 release line. */
export type LegacyRunnerDef = z.infer<typeof legacyRunnerDefSchema>;
/** @deprecated Use RunnerPromptCommand for canonical runner definitions. */
export type TerminalPromptRunnerCommand = LegacyRunnerDef["commands"][number];
export type RunnerDefInput = RunnerDef | LegacyRunnerDef;

export interface ParsedRunnerDef {
  readonly runner: RunnerDef;
  readonly warnings: readonly string[];
}

export const LEGACY_RUNNER_WARNING =
  'deprecated RunnerDef kind "orca-plugin"; migrate this source to kind "runner"';

export const RUNNER_DEF_SCHEMA_REL = "schemas/runner-def.schema.json";

export const runnerDefJsonSchema = z.toJSONSchema(runnerDefSchema, {
  target: "draft-2020-12",
});

function normalizeLegacyRunner(runner: LegacyRunnerDef): RunnerDef {
  return {
    kind: "runner",
    id: runner.id,
    publisher: runner.publisher,
    title: runner.title,
    ...(runner.description === undefined ? {} : { description: runner.description }),
    version: runner.version,
    commands: runner.commands.map((command) => ({
      kind: "prompt",
      id: command.id,
      title: command.title,
      context: command.context,
      prompt: command.prompt,
      mode: command.enter === "submit" ? "run" : "stage",
    })),
    x: { "orca-plugin": { engine: runner.engine } },
  };
}

export function parseRunnerDefWithWarnings(input: unknown): ParsedRunnerDef {
  const canonical = runnerDefSchema.safeParse(input);
  if (canonical.success) return { runner: canonical.data, warnings: [] };

  const legacy = legacyRunnerDefSchema.safeParse(input);
  if (legacy.success) {
    return { runner: normalizeLegacyRunner(legacy.data), warnings: [LEGACY_RUNNER_WARNING] };
  }

  return { runner: runnerDefSchema.parse(input), warnings: [] };
}

export function parseRunnerDef(input: unknown): RunnerDef {
  return parseRunnerDefWithWarnings(input).runner;
}
