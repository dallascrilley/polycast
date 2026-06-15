import type { CommandDef, EmittedFile, Emitter, ValidationIssue } from "../types.ts";

export function validateEmission(
  emitter: Emitter,
  cmd: CommandDef,
  files: readonly EmittedFile[],
): readonly ValidationIssue[] {
  if (!emitter.validate) return [];
  return emitter.validate(cmd, files);
}

export function validateAll(
  emitter: Emitter,
  cmd: CommandDef,
  files: readonly EmittedFile[],
  strict: boolean,
): readonly ValidationIssue[] {
  const issues = validateEmission(emitter, cmd, files);
  if (!strict) return issues.filter((i) => i.severity === "error");
  return issues;
}

export function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((i) => `[${i.severity}] ${i.target}: ${i.message}`).join("\n");
}
