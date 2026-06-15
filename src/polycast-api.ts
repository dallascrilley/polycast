import { chmod, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ApplyResult } from "./apply.ts";
import { applyBuilt, installDirForTarget, pruneOwned } from "./apply.ts";
import { commandDefToModule } from "./command-source.ts";
import { defaultCommandsDir, loadCommandJson, writeCommandsJson } from "./commands-store.ts";
import { assertValid } from "./define.ts";
import { loadCommands } from "./load.ts";
import { compileCherriArtifacts } from "./post-build.ts";
import { emitCatalogs, emitCommand, emitters } from "./registry.ts";
import { executeCommand } from "./run.ts";
import { targetNeedsCommandsStore } from "./shim.ts";
import type { CommandDef, EmittedFile } from "./types.ts";
import { validateAll } from "./validate/index.ts";

export interface PolycastBuildOptions {
  readonly dir?: string;
  readonly out?: string;
  readonly targets?: readonly string[];
  readonly strict?: boolean;
}

export interface PolycastApplyOptions {
  readonly dir?: string;
  readonly out?: string;
  readonly targets?: readonly string[];
  readonly write?: boolean;
  readonly prune?: boolean;
  readonly pruneOnly?: boolean;
}

export interface PolycastRunOptions {
  readonly id: string;
  readonly commandsDir?: string;
  readonly out?: string;
  readonly argv?: readonly string[];
  readonly text?: string;
}

export interface CommandListEntry {
  readonly id: string;
  readonly modality: string;
  readonly title: string;
  readonly description: string;
  readonly surfaces: readonly string[];
}

export interface TargetEntry {
  readonly target: string;
  readonly supports: readonly string[];
}

export interface BuildSummary {
  readonly outRoot: string;
  readonly written: number;
  readonly skipped: number;
  readonly files: readonly string[];
  readonly issues: readonly string[];
}

export class PolycastError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "PolycastError";
  }
}

function emitterListedForCommand(emitter: (typeof emitters)[number], cmd: CommandDef): boolean {
  if (emitter.supports.includes(cmd.modality) && emitter.emit(cmd).length > 0) return true;
  if (!emitter.emitCatalog) return false;
  if (emitter.target === "raycast-snippet") return Boolean(cmd.x?.raycast?.snippet?.text);
  if (emitter.target === "raycast-quicklink") return Boolean(cmd.x?.raycast?.quicklink?.link);
  return emitter.emitCatalog([cmd]).length > 0;
}

async function writeEmitted(outRoot: string, target: string, file: EmittedFile): Promise<string> {
  const dest = join(outRoot, target, file.path);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, file.contents);
  if (file.mode) await chmod(dest, file.mode);
  return `${target}/${file.path}`;
}

async function validateBuilt(dir: string, targets: readonly string[]): Promise<string[]> {
  const commands = await loadCommands(dir);
  const issues: string[] = [];
  for (const cmd of commands) {
    for (const result of emitCommand(cmd, [...targets])) {
      if (result.skipped) continue;
      const emitter = emitters.find((e) => e.target === result.target);
      if (!emitter) continue;
      for (const issue of validateAll(emitter, cmd, result.files, true)) {
        issues.push(`${cmd.id}/${result.target}: [${issue.severity}] ${issue.message}`);
      }
    }
  }
  return issues;
}

export async function polycastList(dir = "commands"): Promise<CommandListEntry[]> {
  const commands = await loadCommands(dir);
  return commands.map((cmd) => ({
    id: cmd.id,
    modality: cmd.modality,
    title: cmd.title,
    description: cmd.description,
    surfaces: emitters.filter((e) => emitterListedForCommand(e, cmd)).map((e) => e.target),
  }));
}

export function polycastTargets(): TargetEntry[] {
  return emitters.map((e) => ({ target: e.target, supports: e.supports }));
}

export async function polycastBuild(options: PolycastBuildOptions = {}): Promise<BuildSummary> {
  const dir = options.dir ?? "commands";
  const outRoot = resolve(options.out ?? (await mkdtemp(join(tmpdir(), "polycast-build-"))));
  const targets = options.targets ?? emitters.map((e) => e.target);
  const strict = options.strict ?? false;
  const commands = await loadCommands(dir);
  await writeCommandsJson(commands, join(outRoot, "commands"));

  const files: string[] = [];
  let written = 0;
  let skipped = 0;
  const issues: string[] = [];

  for (const cmd of commands) {
    for (const result of emitCommand(cmd, targets)) {
      if (result.skipped) {
        skipped++;
        continue;
      }
      const emitter = emitters.find((e) => e.target === result.target);
      if (emitter) {
        issues.push(
          ...validateAll(emitter, cmd, result.files, strict).map(
            (v) => `${cmd.id}/${result.target}: [${v.severity}] ${v.message}`,
          ),
        );
      }
      for (const file of result.files) {
        files.push(await writeEmitted(outRoot, result.target, file));
        written++;
      }
      if (result.target === "shortcuts-cherri") {
        await compileCherriArtifacts(join(outRoot, result.target), result.files);
      }
    }
  }

  for (const result of emitCatalogs(commands, targets)) {
    if (result.skipped) continue;
    for (const file of result.files) {
      files.push(await writeEmitted(outRoot, result.target, file));
      written++;
    }
  }

  if (issues.length > 0) {
    throw new PolycastError(issues.join("\n"), "VALIDATION_FAILED");
  }

  return { outRoot, written, skipped, files, issues: [] };
}

export async function polycastApply(
  options: PolycastApplyOptions = {},
): Promise<{ readonly results: readonly ApplyResult[]; readonly refused: number }> {
  const dir = options.dir ?? "commands";
  const outRoot = resolve(options.out ?? "build");
  const targets = options.targets ?? emitters.map((e) => e.target);
  const write = options.write ?? false;
  const results: ApplyResult[] = [];

  if (options.prune) {
    for (const target of targets) {
      const root = installDirForTarget(target);
      if (!root) continue;
      const removed = await pruneOwned(root, write);
      for (const p of removed) {
        results.push({
          target,
          action: write ? "prune" : "would prune",
          path: p,
        });
      }
    }
    if (options.pruneOnly) return { results, refused: 0 };
  }

  if (write) {
    for (const target of targets) {
      try {
        await readdir(join(outRoot, target));
      } catch {
        throw new PolycastError(`missing build output for ${target}`, "MISSING_BUILD");
      }
    }
    if (targets.some(targetNeedsCommandsStore)) {
      try {
        await readdir(join(outRoot, "commands"));
      } catch {
        throw new PolycastError("missing build/commands JSON store", "MISSING_COMMANDS");
      }
    }
    const issues = await validateBuilt(dir, targets);
    if (issues.length > 0) {
      throw new PolycastError(issues.join("\n"), "VALIDATION_FAILED");
    }
  }

  results.push(
    ...(await applyBuilt({
      outRoot,
      write,
      targets,
    })),
  );

  const refused = results.filter((r) => r.action === "refused").length;
  if (write && refused > 0) {
    throw new PolycastError(`${refused} path(s) refused — not polycast-owned`, "APPLY_REFUSED");
  }

  return { results, refused };
}

export async function polycastRun(options: PolycastRunOptions): Promise<number> {
  const commandsDir = options.commandsDir ?? defaultCommandsDir(options.out ?? "build");
  const cmd = await loadCommandJson(options.id, commandsDir);
  return executeCommand(cmd, { argv: options.argv ?? [], text: options.text });
}

export async function polycastCommandUpsert(
  cmd: CommandDef,
  options: { readonly dir?: string; readonly write?: boolean } = {},
): Promise<{ readonly path: string; readonly preview: string; readonly written: boolean }> {
  assertValid(cmd);
  const commandsDir = resolve(options.dir ?? "commands");
  const path = join(commandsDir, `${cmd.id}.ts`);
  const preview = commandDefToModule(cmd);
  if (options.write) {
    await mkdir(commandsDir, { recursive: true });
    await writeFile(path, preview);
    return { path, preview, written: true };
  }
  return { path, preview, written: false };
}
