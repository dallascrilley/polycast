#!/usr/bin/env bun
import { join, resolve } from "node:path";
import { operatorApprovedShortcutImport } from "./apply.ts";
import { deviceFabricCli } from "./device-fabric.ts";
import {
  captureRaycastSnippets,
  type RaycastSnippetCapturePlan,
} from "./importers/raycast-snippets.ts";
import {
  PolycastError,
  polycastApply,
  polycastBuild,
  polycastCommandUpsert,
  polycastList,
  polycastRun,
  polycastTargets,
} from "./polycast-api.ts";
import { polycastRemote } from "./remote.ts";
import {
  polycastRunnerBuild,
  polycastRunnerList,
  polycastRunnerTargets,
  type RunnerWarning,
} from "./runner-api.ts";

const HELP = `polycast — one command definition, cast to many launchers

Usage:
  polycast list [--dir <commands>]
  polycast build [--dir <commands>] [--out <dir>] [--target <a,b>] [--strict]
  polycast device list
  polycast device build [--dir <source>] [--out <dir>]
  polycast device run <action> --target <local|authorized-remote> [--destination <device>] [--] [files...]
  polycast device receive --forced
  polycast targets
  polycast runner list [--dir <runners>]
  polycast runner targets
  polycast runner build [--dir <runners>] [--out <dir>] [--target <a,b>]
  polycast capture --from raycast-snippets [--input <export.json>] [--dir <output>] [--write]
  polycast run <id> [--commands <dir>] [--] [args...]
  polycast remote --forced [--commands <dir>]
  polycast apply [--out <dir>] [--target <a,b>] [--write] [--import-shortcuts] [--prune] [--prune-only]

Options:
  --dir       <path>   command definitions directory (default: ./commands)
  --out       <path>   build output root (default: ./build)
  --commands  <path>   JSON command store for run (default: <out>/commands)
  --from      <source> capture source (supported: raycast-snippets)
  --input     <path>   source export (default: latest bounded Raycast snippets export)
  --target    <list>   comma-separated target ids (default: all)
  --strict           fail build on validation warnings/errors
  --write            perform apply/capture writes (both default to dry-run)
  --import-shortcuts import compiled .shortcut files in Shortcuts.app (requires --write; explicit operator consent)
  --prune            remove polycast-owned artifacts (incl. the JSON body store) before install
  --prune-only       remove polycast-owned artifacts only (skip install)
  --forced           accept only SSH_ORIGINAL_COMMAND's fixed remote protocol form

Environment:
  POLYCAST_SKIP_CHERRI=1     skip Cherri compile step
  POLYCAST_DEVICE_FABRIC_REMOTES comma-separated saved SSH profiles allowed as remote targets
  POLYCAST_DEVICE_FABRIC_CONSOLE_PROFILE saved SSH/mosh profile (default: agent-console)
  POLYCAST_DEVICE_FABRIC_CONSOLE_TRANSPORT ssh or mosh (default: ssh)
  POLYCAST_RAYCAST_DIR       Raycast script install dir (default: ~/.polycast/raycast)
  POLYCAST_POPCLIP_EXTENSIONS PopClip extensions dir
  POLYCAST_DROPZONE_ACTIONS  Dropzone Actions folder
  POLYCAST_DROPOVER_SCRIPTS  Dropover staging directory
  POLYCAST_AGENT_BIN         agent-cli install dir
  POLYCAST_COMMANDS_DIR      JSON command store (default: ~/.polycast/commands on apply)
  POLYCAST_BIN               polycast executable for agent-cli stubs (default: polycast)
  POLYCAST_RAYCAST_SNIPPET_EXPORT_DIR optional directory for latest-export discovery
`;

interface Flags {
  readonly _: string[];
  readonly dir: string;
  readonly out: string;
  readonly commands?: string;
  readonly from?: string;
  readonly input?: string;
  readonly target?: string[];
  readonly strict: boolean;
  readonly write: boolean;
  readonly importShortcuts: boolean;
  readonly prune: boolean;
  readonly pruneOnly: boolean;
  readonly forced: boolean;
}

interface ParseFlagOptions {
  readonly defaultDir?: string;
  readonly stopAtSeparator?: boolean;
}

function parseFlags(argv: string[], options: ParseFlagOptions = {}): Flags {
  const positional: string[] = [];
  let dir = options.defaultDir ?? "commands";
  let out = "build";
  let commands: string | undefined;
  let from: string | undefined;
  let input: string | undefined;
  let target: string[] | undefined;
  let strict = false;
  let write = false;
  let importShortcuts = false;
  let prune = false;
  let pruneOnly = false;
  let forced = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (options.stopAtSeparator && a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a === "--dir") dir = argv[++i] ?? dir;
    else if (a === "--out") out = argv[++i] ?? out;
    else if (a === "--commands") commands = argv[++i] ?? commands;
    else if (a === "--from") from = argv[++i] ?? from;
    else if (a === "--input") input = argv[++i] ?? input;
    else if (a === "--target") target = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (a === "--strict") strict = true;
    else if (a === "--write") write = true;
    else if (a === "--import-shortcuts") importShortcuts = true;
    else if (a === "--prune") prune = true;
    else if (a === "--prune-only") {
      prune = true;
      pruneOnly = true;
    } else if (a === "--forced") forced = true;
    else if (a) positional.push(a);
  }
  return {
    _: positional,
    dir,
    out,
    commands,
    from,
    input,
    target,
    strict,
    write,
    importShortcuts,
    prune,
    pruneOnly,
    forced,
  };
}

function nonzeroCounts(counts: Readonly<Record<string, number>>): readonly [string, number][] {
  return Object.entries(counts).filter((entry): entry is [string, number] => entry[1] > 0);
}

function printCaptureSummary(plan: RaycastSnippetCapturePlan): void {
  console.log(`source      ${plan.sourcePath}`);
  console.log(`sha256      ${plan.sourceSha256}`);
  console.log(`entries     ${plan.sourceEntries}`);
  console.log(`accepted    ${plan.accepted}`);
  console.log(`rejected    ${plan.rejected}`);
  for (const [reason, count] of nonzeroCounts(plan.rejectionCounts)) {
    console.log(`  reject ${reason.padEnd(24)} ${count}`);
  }
  for (const [reason, count] of nonzeroCounts(plan.lossCounts)) {
    console.log(`  loss   ${reason.padEnd(24)} ${count}`);
  }
  console.log(`output      ${plan.outputDir}`);
  console.log(
    `definitions create=${plan.create} update=${plan.update} remove=${plan.remove} unchanged=${plan.unchanged}`,
  );
  console.log(`report      ${plan.reportChanged ? "update" : "unchanged"}`);
  console.log(
    plan.written
      ? "\nCapture written. The source export was not modified or copied."
      : "\nDry run. Review the rejection counts, then pass --write to create definitions.",
  );
}

async function cmdCapture(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, { defaultDir: join("commands", "raycast-snippets") });
  if (flags.from !== "raycast-snippets") {
    fail(new PolycastError("capture requires --from raycast-snippets", "CAPTURE_SOURCE_REQUIRED"));
  }
  try {
    printCaptureSummary(
      await captureRaycastSnippets({
        input: flags.input,
        outputDir: flags.dir,
        write: flags.write,
      }),
    );
  } catch (error) {
    fail(error);
  }
}

async function cmdRunner(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  const flags = parseFlags(rest, { defaultDir: "runners" });
  const dir = flags.dir;

  if (sub === "list") {
    const entries = await polycastRunnerList(dir);
    if (entries.length === 0) {
      console.log(`no runners found in ${resolve(dir)}`);
      return;
    }
    for (const runner of entries) {
      const targets = runner.targets
        .map((target) =>
          target.status === "supported"
            ? `${target.target}:supported`
            : `${target.target}:skipped (${target.reason})`,
        )
        .join(", ");
      console.log(`${runner.id}  [${targets}]  -> ${runner.commands.join(", ")}`);
      console.log(`    ${runner.title}`);
    }
    printRunnerWarnings(entries.flatMap((entry) => entry.warnings));
    return;
  }

  if (sub === "targets") {
    for (const entry of polycastRunnerTargets()) console.log(entry.target);
    return;
  }

  if (sub === "build") {
    const summary = await polycastRunnerBuild({
      dir,
      out: flags.out,
      targets: flags.target,
    });
    for (const file of summary.files) {
      console.log(`emit  ${file}`);
    }
    for (const result of summary.results) {
      if (result.status === "skipped") {
        console.log(`skip  ${result.runner} -> ${result.target}: ${result.reason}`);
      }
    }
    printRunnerWarnings(summary.warnings);
    console.log(`\n${summary.written} file(s) written to ${summary.outRoot}.`);
    return;
  }

  console.error(
    "usage: polycast runner <list|targets|build> [--dir <runners>] [--out <dir>] [--target <a,b>]",
  );
  process.exit(1);
}

function printRunnerWarnings(warnings: readonly RunnerWarning[]): void {
  const printed = new Set<string>();
  for (const warning of warnings) {
    const key = `${warning.source}\0${warning.message}`;
    if (printed.has(key)) continue;
    printed.add(key);
    console.error(`warning: ${warning.source}: ${warning.message}`);
  }
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
    if (flags.importShortcuts && !flags.write) {
      fail(
        new PolycastError("--import-shortcuts requires --write", "SHORTCUT_IMPORT_REQUIRES_WRITE"),
      );
    }
    const { results, refused } = await polycastApply({
      dir: flags.dir,
      out: flags.out,
      targets: flags.target,
      write: flags.write,
      prune: flags.prune,
      pruneOnly: flags.pruneOnly,
      shortcutImport: flags.importShortcuts ? operatorApprovedShortcutImport() : { kind: "none" },
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

async function cmdRemote(flags: Flags): Promise<void> {
  if (!flags.forced || flags._.length > 0) {
    console.error("usage: polycast remote --forced [--commands <dir>]");
    process.exit(1);
  }
  const commandsDir = flags.commands ?? join(resolve(flags.out), "commands");
  process.exit(
    await polycastRemote({
      commandsDir,
      originalCommand: process.env.SSH_ORIGINAL_COMMAND,
    }),
  );
}

async function main(): Promise<void> {
  const [sub, ...rest] = process.argv.slice(2);
  if (sub === "device") process.exit(await deviceFabricCli(rest));
  const flags = parseFlags(rest, { stopAtSeparator: sub === "run" });

  switch (sub) {
    case "list":
      return cmdList(flags);
    case "build":
      return cmdBuild(flags);
    case "apply":
      return cmdApply(flags);
    case "run":
      return cmdRun(flags._[0], flags, flags._.slice(1));
    case "remote":
      return cmdRemote(flags);
    case "targets":
      return cmdTargets();
    case "runner":
      return cmdRunner(rest);
    case "capture":
      return cmdCapture(rest);
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
