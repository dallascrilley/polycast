#!/usr/bin/env bun
import { join, resolve } from "node:path";
import {
  PolycastError,
  polycastApply,
  polycastBuild,
  polycastCommandUpsert,
  polycastList,
  polycastRun,
  polycastTargets,
} from "./polycast-api.ts";
import { polycastRunnerBuild, polycastRunnerList } from "./runner-api.ts";

const HELP = `polycast — one command definition, cast to many launchers

Usage:
  polycast list [--dir <commands>]
  polycast build [--dir <commands>] [--out <dir>] [--target <a,b>] [--strict]
  polycast targets
  polycast runner list [--dir <runners>]
  polycast runner build [--dir <runners>] [--out <dir>]
  polycast run <id> [--commands <dir>] [--] [args...]
  polycast apply [--out <dir>] [--target <a,b>] [--write] [--prune] [--prune-only]

Options:
  --dir       <path>   command definitions directory (default: ./commands)
  --out       <path>   build output root (default: ./build)
  --commands  <path>   JSON command store for run (default: <out>/commands)
  --target    <list>   comma-separated target ids (default: all)
  --strict           fail build on validation warnings/errors
  --write            apply writes to install locations (default: dry-run)
  --prune            remove polycast-owned artifacts (incl. the JSON body store) before install
  --prune-only       remove polycast-owned artifacts only (skip install)

Environment:
  POLYCAST_SKIP_CHERRI=1     skip Cherri compile step
  POLYCAST_RAYCAST_DIR       Raycast script install dir (default: ~/.polycast/raycast)
  POLYCAST_POPCLIP_EXTENSIONS PopClip extensions dir
  POLYCAST_DROPZONE_ACTIONS  Dropzone Actions folder
  POLYCAST_DROPOVER_SCRIPTS  Dropover staging directory
  POLYCAST_AGENT_BIN         agent-cli install dir
  POLYCAST_COMMANDS_DIR      JSON command store (default: ~/.polycast/commands on apply)
  POLYCAST_BIN               polycast executable for agent-cli stubs (default: polycast)
`;

interface Flags {
  readonly _: string[];
  readonly dir: string;
  readonly out: string;
  readonly commands?: string;
  readonly target?: string[];
  readonly strict: boolean;
  readonly write: boolean;
  readonly prune: boolean;
  readonly pruneOnly: boolean;
}

function parseFlags(argv: string[], defaultDir = "commands"): Flags {
  const positional: string[] = [];
  let dir = defaultDir;
  let out = "build";
  let commands: string | undefined;
  let target: string[] | undefined;
  let strict = false;
  let write = false;
  let prune = false;
  let pruneOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") dir = argv[++i] ?? dir;
    else if (a === "--out") out = argv[++i] ?? out;
    else if (a === "--commands") commands = argv[++i] ?? commands;
    else if (a === "--target") target = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (a === "--strict") strict = true;
    else if (a === "--write") write = true;
    else if (a === "--prune") prune = true;
    else if (a === "--prune-only") {
      prune = true;
      pruneOnly = true;
    } else if (a) positional.push(a);
  }
  return { _: positional, dir, out, commands, target, strict, write, prune, pruneOnly };
}

async function cmdRunner(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  const flags = parseFlags(rest, "runners");
  const dir = flags.dir;

  if (sub === "list") {
    const entries = await polycastRunnerList(dir);
    if (entries.length === 0) {
      console.log(`no runners found in ${resolve(dir)}`);
      return;
    }
    for (const runner of entries) {
      console.log(`${runner.id}  [${runner.target}]  -> ${runner.commands.join(", ")}`);
      console.log(`    ${runner.title}`);
    }
    return;
  }

  if (sub === "build") {
    const summary = await polycastRunnerBuild({ dir, out: flags.out });
    for (const file of summary.files) {
      console.log(`emit  ${file}`);
    }
    console.log(`\n${summary.written} file(s) written to ${summary.outRoot}.`);
    return;
  }

  console.error("usage: polycast runner <list|build> [--dir <runners>] [--out <dir>]");
  process.exit(1);
}

function fail(err: unknown): never {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

async function cmdList(flags: Flags): Promise<void> {
  const entries = await polycastList(flags.dir);
  if (entries.length === 0) {
    console.log(`no commands found in ${resolve(flags.dir)}`);
    return;
  }
  for (const cmd of entries) {
    const surfaces = cmd.surfaces.join(", ");
    console.log(`${cmd.id}  [${cmd.modality}]  -> ${surfaces || "(no compatible surface)"}`);
    console.log(`    ${cmd.title} — ${cmd.description}`);
  }
}

async function cmdBuild(flags: Flags): Promise<void> {
  try {
    const summary = await polycastBuild({
      dir: flags.dir,
      out: flags.out,
      targets: flags.target,
      strict: flags.strict,
    });
    for (const file of summary.files) {
      console.log(`emit  ${file}`);
    }
    console.log(
      `\n${summary.written} file(s) written to ${summary.outRoot}, ${summary.skipped} target(s) skipped.`,
    );
  } catch (err) {
    fail(err);
  }
}

async function cmdApply(flags: Flags): Promise<void> {
  try {
    const { results, refused } = await polycastApply({
      dir: flags.dir,
      out: flags.out,
      targets: flags.target,
      write: flags.write,
      prune: flags.prune,
      pruneOnly: flags.pruneOnly,
    });
    for (const r of results) {
      console.log(`${r.action.padEnd(18)} ${r.target}  ${r.path}`);
    }
    if (!flags.write) {
      console.log("\nDry run. Pass --write to install.");
    } else if (refused > 0) {
      console.error(`\n${refused} path(s) refused — not polycast-owned`);
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof PolycastError && err.code === "APPLY_REFUSED") {
      fail(err);
    }
    fail(err);
  }
}

function cmdTargets(): void {
  for (const e of polycastTargets()) {
    console.log(`${e.target}  (supports: ${e.supports.join(", ") || "catalog"})`);
  }
}

async function cmdRun(
  id: string | undefined,
  flags: Flags,
  runArgv: readonly string[],
): Promise<void> {
  if (!id) {
    console.error("usage: polycast run <id> [--commands <dir>] [--] [args...]");
    process.exit(1);
  }
  const commandsDir = flags.commands ?? join(resolve(flags.out), "commands");
  process.exit(
    await polycastRun({
      id,
      commandsDir,
      argv: runArgv,
    }),
  );
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
    case "run":
      return cmdRun(flags._[0], flags, flags._.slice(1));
    case "targets":
      return cmdTargets();
    case "runner":
      return cmdRunner(rest);
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

main().catch(fail);
