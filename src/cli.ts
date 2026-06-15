#!/usr/bin/env bun
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadCommands } from "./load.ts";
import { emitCommand, emitters } from "./registry.ts";

const HELP = `polycast — one command definition, cast to many launchers

Usage:
  polycast list [--dir <commands>]
  polycast build [--dir <commands>] [--out <dir>] [--target <a,b>]
  polycast targets
  polycast apply                       (not yet implemented)

Options:
  --dir     <path>   command definitions directory (default: ./commands)
  --out     <path>   build output root (default: ./build)
  --target  <list>   comma-separated target ids (default: all)
`;

interface Flags {
  readonly _: string[];
  readonly dir: string;
  readonly out: string;
  readonly target?: string[];
}

function parseFlags(argv: string[]): Flags {
  const positional: string[] = [];
  let dir = "commands";
  let out = "build";
  let target: string[] | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") dir = argv[++i] ?? dir;
    else if (a === "--out") out = argv[++i] ?? out;
    else if (a === "--target") target = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (a) positional.push(a);
  }
  return { _: positional, dir, out, target };
}

async function cmdList(flags: Flags): Promise<void> {
  const commands = await loadCommands(flags.dir);
  if (commands.length === 0) {
    console.log(`no commands found in ${resolve(flags.dir)}`);
    return;
  }
  for (const cmd of commands) {
    const surfaces = emitters
      .filter((e) => e.supports.includes(cmd.modality))
      .map((e) => e.target)
      .join(", ");
    console.log(`${cmd.id}  [${cmd.modality}]  -> ${surfaces || "(no compatible surface)"}`);
    console.log(`    ${cmd.title} — ${cmd.description}`);
  }
}

async function cmdBuild(flags: Flags): Promise<void> {
  const commands = await loadCommands(flags.dir);
  const outRoot = resolve(flags.out);
  let written = 0;
  let skipped = 0;

  for (const cmd of commands) {
    for (const result of emitCommand(cmd, flags.target)) {
      if (result.skipped) {
        skipped++;
        console.log(`skip  ${cmd.id} -> ${result.target} (modality "${cmd.modality}" unsupported)`);
        continue;
      }
      for (const file of result.files) {
        const dest = join(outRoot, result.target, file.path);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, file.contents);
        if (file.mode) await chmod(dest, file.mode);
        written++;
        console.log(`emit  ${result.target}/${file.path}`);
      }
    }
  }
  console.log(`\n${written} file(s) written to ${outRoot}, ${skipped} target(s) skipped.`);
}

function cmdTargets(): void {
  for (const e of emitters) {
    console.log(`${e.target}  (supports: ${e.supports.join(", ")})`);
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
    case "targets":
      return cmdTargets();
    case "apply":
      console.error("apply: not yet implemented (installs into each launcher's runtime dir)");
      process.exit(2);
      break;
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
