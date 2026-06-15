#!/usr/bin/env bun
import { chmod, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { applyBuilt, installDirForTarget, pruneOwned } from "./apply.ts";
import { loadCommands } from "./load.ts";
import { compileCherriArtifacts } from "./post-build.ts";
import { emitCatalogs, emitCommand, emitters } from "./registry.ts";
import type { CommandDef, EmittedFile } from "./types.ts";
import { validateAll } from "./validate/index.ts";

const HELP = `polycast — one command definition, cast to many launchers

Usage:
  polycast list [--dir <commands>]
  polycast build [--dir <commands>] [--out <dir>] [--target <a,b>] [--strict]
  polycast targets
  polycast apply [--out <dir>] [--target <a,b>] [--write] [--prune] [--prune-only]

Options:
  --dir     <path>   command definitions directory (default: ./commands)
  --out     <path>   build output root (default: ./build)
  --target  <list>   comma-separated target ids (default: all)
  --strict           fail build on validation warnings/errors
  --write            apply writes to install locations (default: dry-run)
  --prune            remove polycast-owned artifacts before install
  --prune-only       remove polycast-owned artifacts only (skip install)

Environment:
  POLYCAST_SKIP_CHERRI=1     skip Cherri compile step
  POLYCAST_RAYCAST_DIR       Raycast script install dir
  POLYCAST_POPCLIP_EXTENSIONS PopClip extensions dir
  POLYCAST_DROPZONE_ACTIONS  Dropzone Actions folder
  POLYCAST_DROPOVER_SCRIPTS  Dropover staging directory
  POLYCAST_AGENT_BIN         agent-cli install dir
`;

interface Flags {
  readonly _: string[];
  readonly dir: string;
  readonly out: string;
  readonly target?: string[];
  readonly strict: boolean;
  readonly write: boolean;
  readonly prune: boolean;
  readonly pruneOnly: boolean;
}

function parseFlags(argv: string[]): Flags {
  const positional: string[] = [];
  let dir = "commands";
  let out = "build";
  let target: string[] | undefined;
  let strict = false;
  let write = false;
  let prune = false;
  let pruneOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") dir = argv[++i] ?? dir;
    else if (a === "--out") out = argv[++i] ?? out;
    else if (a === "--target") target = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (a === "--strict") strict = true;
    else if (a === "--write") write = true;
    else if (a === "--prune") prune = true;
    else if (a === "--prune-only") {
      prune = true;
      pruneOnly = true;
    } else if (a) positional.push(a);
  }
  return { _: positional, dir, out, target, strict, write, prune, pruneOnly };
}

async function writeEmitted(outRoot: string, target: string, file: EmittedFile): Promise<void> {
  const dest = join(outRoot, target, file.path);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, file.contents);
  if (file.mode) await chmod(dest, file.mode);
  console.log(`emit  ${target}/${file.path}`);
}

function emitterListedForCommand(emitter: (typeof emitters)[number], cmd: CommandDef): boolean {
  if (emitter.supports.includes(cmd.modality) && emitter.emit(cmd).length > 0) return true;
  if (!emitter.emitCatalog) return false;
  if (emitter.target === "raycast-snippet") return Boolean(cmd.x?.raycast?.snippet?.text);
  if (emitter.target === "raycast-quicklink") return Boolean(cmd.x?.raycast?.quicklink?.link);
  return emitter.emitCatalog([cmd]).length > 0;
}

async function cmdList(flags: Flags): Promise<void> {
  const commands = await loadCommands(flags.dir);
  if (commands.length === 0) {
    console.log(`no commands found in ${resolve(flags.dir)}`);
    return;
  }
  for (const cmd of commands) {
    const surfaces = emitters
      .filter((e) => emitterListedForCommand(e, cmd))
      .map((e) => e.target)
      .join(", ");
    console.log(`${cmd.id}  [${cmd.modality}]  -> ${surfaces || "(no compatible surface)"}`);
    console.log(`    ${cmd.title} — ${cmd.description}`);
  }
}

async function cmdBuild(flags: Flags): Promise<void> {
  const commands = await loadCommands(flags.dir);
  const outRoot = resolve(flags.out);
  const targets = flags.target ?? emitters.map((e) => e.target);
  let written = 0;
  let skipped = 0;
  const issues: string[] = [];

  for (const cmd of commands) {
    for (const result of emitCommand(cmd, targets)) {
      if (result.skipped) {
        skipped++;
        console.log(`skip  ${cmd.id} -> ${result.target} (modality "${cmd.modality}" unsupported)`);
        continue;
      }
      const emitter = emitters.find((e) => e.target === result.target);
      if (emitter) {
        const validation = validateAll(emitter, cmd, result.files, flags.strict);
        if (validation.length > 0) {
          issues.push(
            ...validation.map((v) => `${cmd.id}/${result.target}: [${v.severity}] ${v.message}`),
          );
        }
      }
      for (const file of result.files) {
        await writeEmitted(outRoot, result.target, file);
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
      await writeEmitted(outRoot, result.target, file);
      written++;
    }
  }

  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exit(1);
  }

  console.log(`\n${written} file(s) written to ${outRoot}, ${skipped} target(s) skipped.`);
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

async function cmdApply(flags: Flags): Promise<void> {
  const targets = flags.target ?? emitters.map((e) => e.target);
  const outRoot = resolve(flags.out);

  if (flags.prune) {
    for (const target of targets) {
      const root = installDirForTarget(target);
      if (!root) {
        console.log(`prune skip         ${target}  (no install dir)`);
        continue;
      }
      const removed = await pruneOwned(root, flags.write);
      const label = flags.write ? "prune" : "would prune";
      for (const p of removed) console.log(`${label.padEnd(18)} ${target}  ${p}`);
    }
    if (!flags.write) console.log("\nDry run. Pass --write to remove owned artifacts.");
    if (flags.pruneOnly) return;
  }

  if (flags.write) {
    for (const target of targets) {
      try {
        await readdir(join(outRoot, target));
      } catch {
        console.error(`missing build output for ${target}; run build first`);
        process.exit(1);
      }
    }
    const issues = await validateBuilt(flags.dir, targets);
    if (issues.length > 0) {
      console.error(issues.join("\n"));
      process.exit(1);
    }
  }

  const results = await applyBuilt({
    outRoot,
    write: flags.write,
    targets,
  });
  let refused = 0;
  for (const r of results) {
    console.log(`${r.action.padEnd(18)} ${r.target}  ${r.path}`);
    if (r.action === "refused") refused++;
  }
  if (!flags.write) {
    console.log("\nDry run. Pass --write to install.");
  } else if (refused > 0) {
    console.error(`\n${refused} path(s) refused — not polycast-owned`);
    process.exit(1);
  }
}

function cmdTargets(): void {
  for (const e of emitters) {
    console.log(`${e.target}  (supports: ${e.supports.join(", ") || "catalog"})`);
  }
}

async function main(): Promise<void> {
  const [sub, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  switch (sub) {
    case "list":
      return cmdList(flags);
    case "build":
      return cmdBuild(flags);
    case "apply":
      return cmdApply(flags);
    case "targets":
      return cmdTargets();
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    default:
      console.error(`unknown command: ${sub}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
