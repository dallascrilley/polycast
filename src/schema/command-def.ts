import { z } from "zod";
import { assertValid } from "../define.ts";
import { type CommandDef, SHORTCUTS_INPUTS } from "../types.ts";

const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const commandArgSchema = z.object({
  name: z.string().min(1),
  placeholder: z.string().optional(),
  optional: z.boolean().optional(),
  type: z.enum(["text", "password", "dropdown"]).optional(),
  percentEncoded: z.boolean().optional(),
  data: z
    .array(
      z.object({
        title: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
});

const commandBodySchema = z.object({
  lang: z.enum(["bash", "node", "applescript"]),
  source: z.string(),
});

const shortcutsInputSchema = z.enum(SHORTCUTS_INPUTS);

const crossTargetHintsSchema = z
  .object({
    raycast: z
      .object({
        mode: z.enum(["silent", "fullOutput", "compact", "inline"]).optional(),
        packageName: z.string().optional(),
        iconDark: z.string().optional(),
        needsConfirmation: z.boolean().optional(),
        currentDirectoryPath: z.string().optional(),
        refreshTime: z.string().optional(),
        snippet: z
          .object({
            text: z.string(),
            keyword: z.string().optional(),
          })
          .optional(),
        quicklink: z
          .object({
            link: z.string(),
            openWith: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
    popclip: z
      .object({
        requirements: z.array(z.string()).optional(),
        regex: z.string().optional(),
        after: z.string().optional(),
      })
      .optional(),
    dropzone: z
      .object({
        events: z.array(z.enum(["Dragged", "Clicked"])).optional(),
        handles: z.enum(["Files", "Text", "Files, Text"]).optional(),
        skipConfig: z.boolean().optional(),
        minVersion: z.string().optional(),
      })
      .optional(),
    dropover: z
      .object({
        instantAction: z.boolean().optional(),
      })
      .optional(),
    shortcuts: z
      .object({
        name: z.string().optional(),
        glyph: z.string().optional(),
        color: z.string().optional(),
        from: z.string().optional(),
        inputs: z.array(shortcutsInputSchema).min(1).optional(),
      })
      .optional(),
  })
  .optional();

/** Zod schema for CommandDef JSON (MCP upsert, agents). */
export const commandDefSchema = z
  .object({
    id: z.string().regex(KEBAB_ID, "command id must be kebab-case"),
    title: z.string().min(1),
    description: z.string(),
    icon: z.string().optional(),
    modality: z.enum(["text", "files", "args", "none"]),
    args: z.array(commandArgSchema).optional(),
    body: commandBodySchema,
    x: crossTargetHintsSchema,
    author: z.string().optional(),
  })
  .superRefine((cmd, ctx) => {
    if (cmd.modality === "args" && (!cmd.args || cmd.args.length === 0)) {
      ctx.addIssue({
        code: "custom",
        message: 'modality "args" requires at least one arg',
        path: ["args"],
      });
    }
    if (!cmd.body.source.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "body.source must be non-empty",
        path: ["body", "source"],
      });
    }
  });

/** Draft 2020-12 JSON Schema for documentation and MCP clients. */
export const COMMAND_DEF_SCHEMA_REL = "schemas/command-def.schema.json";

export const commandDefJsonSchema = z.toJSONSchema(commandDefSchema, {
  target: "draft-2020-12",
});

export function parseCommandDefJson(input: unknown): CommandDef {
  const parsed = commandDefSchema.parse(input);
  assertValid(parsed);
  return parsed;
}
