import { z } from "zod";

const PLUGIN_ID_MAX_LENGTH = 64;
const COMMAND_ID_MAX_LENGTH = 256;
const PROMPT_MAX_LENGTH = 4096;
const PLUGIN_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMMAND_ID_RE = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;
const SEMVER_RE =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RESERVED_IDS = new Set(["__proto__", "prototype", "constructor"]);

const pluginIdSchema = z
  .string()
  .max(PLUGIN_ID_MAX_LENGTH)
  .regex(PLUGIN_ID_RE, "must be kebab-case (a-z, 0-9, dashes)")
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

const terminalPromptCommandSchema = z
  .object({
    kind: z.literal("terminal-prompt"),
    id: runnerCommandIdSchema,
    title: nonBlankSchema("title", 256),
    context: z.literal("worktree"),
    prompt: nonBlankSchema("prompt", PROMPT_MAX_LENGTH),
    enter: z.enum(["insert", "submit"]),
  })
  .strict();

const orcaPluginRunnerSchema = z
  .object({
    kind: z.literal("orca-plugin"),
    id: pluginIdSchema,
    publisher: pluginIdSchema,
    title: nonBlankSchema("title", 256),
    description: z.string().max(4096).optional(),
    version: z.string().regex(SEMVER_RE, "must be semver"),
    engine: z
      .string()
      .max(64)
      .regex(/^>=\d+\.\d+\.\d+$/, 'must be a ">=x.y.z" version range'),
    commands: z.array(terminalPromptCommandSchema).min(1).max(256),
  })
  .strict();

/**
 * Strict public authoring schema. The discriminants reserve room for new runner
 * and command kinds without making their fields optional on today's only kind.
 */
export const runnerDefSchema = z
  .discriminatedUnion("kind", [orcaPluginRunnerSchema])
  .superRefine((runner, ctx) => {
    const seen = new Set<string>();
    for (const [index, command] of runner.commands.entries()) {
      if (seen.has(command.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["commands", index, "id"],
          message: `duplicate command id: ${command.id}`,
        });
      }
      seen.add(command.id);
    }
  });

export type RunnerDef = z.infer<typeof runnerDefSchema>;
export type TerminalPromptRunnerCommand = RunnerDef["commands"][number];

export const RUNNER_DEF_SCHEMA_REL = "schemas/runner-def.schema.json";

export const runnerDefJsonSchema = z.toJSONSchema(runnerDefSchema, {
  target: "draft-2020-12",
});

export function parseRunnerDef(input: unknown): RunnerDef {
  return runnerDefSchema.parse(input);
}
