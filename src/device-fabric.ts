import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readSync } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { OWNERSHIP_MARKER } from "./constants.ts";

export const DEVICE_FABRIC_ACTIONS = [
  { id: "agents", name: "Agents" },
  { id: "reviews", name: "Reviews" },
  { id: "agent-console", name: "Agent Console" },
  { id: "send-to-device", name: "Send to Device" },
] as const;

export type DeviceFabricActionId = (typeof DEVICE_FABRIC_ACTIONS)[number]["id"];

const ACTION_IDS: Record<DeviceFabricActionId, true> = {
  agents: true,
  reviews: true,
  "agent-console": true,
  "send-to-device": true,
};
const DEFAULT_AGENTS_URL = "https://dallas-macbook.tail16923a.ts.net/agents";
const DEFAULT_REVIEWS_URL = "https://dallas-macbook.tail16923a.ts.net/reviews";
const REMOTE_COMMAND = "polycast device receive --forced";
const MAX_REMOTE_PAYLOAD_BYTES = 64 * 1024;
const SAFE_PROFILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TAILSCALE_APP_DESCRIPTOR = {
  AppIntentIdentifier: "",
  BundleIdentifier: "io.tailscale.ipn.ios",
  TeamIdentifier: "W5364U7YZB",
  Name: "Tailscale",
};

function deterministicActionUuid(action: DeviceFabricActionId, intent: string): string {
  const bytes = createHash("sha256")
    .update(`polycast/device-fabric/${action}/${intent}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex").toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface DeviceFabricBuildOptions {
  readonly dir?: string;
  readonly out?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface DeviceFabricBuildSummary {
  readonly outRoot: string;
  readonly sources: readonly string[];
  readonly shortcuts: readonly string[];
  readonly compileSkipped: boolean;
}

export interface DeviceFabricRunOptions {
  readonly action: DeviceFabricActionId;
  readonly target: string;
  readonly destination?: string;
  readonly files?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}

interface RemoteEnvelope {
  readonly version: 1;
  readonly action: DeviceFabricActionId;
  readonly destination?: string;
  readonly files: readonly string[];
}

interface SynchronousCommandResult {
  readonly status: number | null;
  readonly stderr?: string | Buffer | null;
}

function requireAction(id: string): DeviceFabricActionId {
  if (!Object.hasOwn(ACTION_IDS, id)) {
    throw new Error(`unknown device action: ${id}`);
  }
  return id as DeviceFabricActionId;
}

function commandAvailable(command: string, env: NodeJS.ProcessEnv): boolean {
  const result = spawnSync("which", [command], { env, stdio: "ignore" });
  return result.status === 0;
}

function commandError(command: readonly string[], result: SynchronousCommandResult): Error {
  const detail = result.stderr?.toString().trim();
  return new Error(
    `${command.join(" ")} failed${result.status === null ? " to start" : ` (${result.status})`}${detail ? `: ${detail}` : ""}`,
  );
}

function runChecked(command: readonly string[], env: NodeJS.ProcessEnv, cwd?: string): void {
  const result = spawnSync(command[0]!, command.slice(1), {
    cwd,
    env,
    encoding: "utf8",
  });
  if (result.status !== 0) throw commandError(command, result);
}

async function runInteractive(
  command: readonly string[],
  env: NodeJS.ProcessEnv,
  stdin?: string,
): Promise<number> {
  return await new Promise<number>((resolvePromise, reject) => {
    const child = spawn(command[0]!, command.slice(1), {
      env,
      stdio: stdin === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise(code ?? 1));
    if (stdin !== undefined) child.stdin?.end(stdin);
  });
}

function tailscalePreflight(env: NodeJS.ProcessEnv): void {
  const command = ["tailscale", "status", "--json"] as const;
  const result = spawnSync(command[0], command.slice(1), { env, encoding: "utf8" });
  if (result.status !== 0) throw commandError(command, result);
  let status: { BackendState?: unknown };
  try {
    status = JSON.parse(result.stdout);
  } catch {
    throw new Error("Tailscale preflight returned invalid JSON");
  }
  if (status.BackendState !== "Running") {
    throw new Error(
      `Tailscale preflight failed: backend is ${String(status.BackendState ?? "unknown")}`,
    );
  }
}

function validatePwaUrl(raw: string, route: "/agents" | "/reviews"): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`invalid ${route.slice(1)} URL`);
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".ts.net") ||
    url.pathname !== route ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    url.search !== "" ||
    url.port !== ""
  ) {
    throw new Error(
      `${route.slice(1)} URL must be an authenticated https .ts.net${route} route without credentials, query, port, or fragment`,
    );
  }
  return url.toString();
}

function validateSavedProfile(profile: string, label: string): string {
  if (!SAFE_PROFILE.test(profile)) {
    throw new Error(
      `${label} must name a saved profile using letters, digits, dot, underscore, or hyphen`,
    );
  }
  return profile;
}

function allowedRemotes(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.POLYCAST_DEVICE_FABRIC_REMOTES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function validateLocalArguments(options: DeviceFabricRunOptions): void {
  const files = options.files ?? [];
  if (options.action === "send-to-device") {
    if (!options.destination) throw new Error("Send to Device requires --destination <device>");
    validateSavedProfile(options.destination, "Taildrop destination");
    if (files.length === 0) throw new Error("Send to Device requires at least one file");
    return;
  }
  if (options.destination !== undefined || files.length > 0) {
    throw new Error(`${options.action} does not accept destination, file, or shared-text input`);
  }
}

async function runLocal(options: DeviceFabricRunOptions, env: NodeJS.ProcessEnv): Promise<number> {
  validateLocalArguments(options);
  tailscalePreflight(env);

  switch (options.action) {
    case "agents": {
      const url = validatePwaUrl(
        env.POLYCAST_DEVICE_FABRIC_AGENTS_URL ?? DEFAULT_AGENTS_URL,
        "/agents",
      );
      return await openUrl(url, env);
    }
    case "reviews": {
      const url = validatePwaUrl(
        env.POLYCAST_DEVICE_FABRIC_REVIEWS_URL ?? DEFAULT_REVIEWS_URL,
        "/reviews",
      );
      return await openUrl(url, env);
    }
    case "agent-console": {
      const transport = env.POLYCAST_DEVICE_FABRIC_CONSOLE_TRANSPORT ?? "ssh";
      if (transport !== "ssh" && transport !== "mosh") {
        throw new Error("console transport must be ssh or mosh");
      }
      const profile = validateSavedProfile(
        env.POLYCAST_DEVICE_FABRIC_CONSOLE_PROFILE ?? "agent-console",
        "console profile",
      );
      return await runInteractive([transport, profile], env);
    }
    case "send-to-device": {
      const files: string[] = [];
      for (const file of options.files ?? []) {
        const absolute = resolve(file);
        const details = await stat(absolute);
        if (!details.isFile()) throw new Error(`Taildrop input is not a file: ${file}`);
        files.push(absolute);
      }
      return await runInteractive(
        ["tailscale", "file", "cp", ...files, `${options.destination}:`],
        env,
      );
    }
    default:
      throw new Error(`unknown device action: ${String(options.action)}`);
  }
}

async function openUrl(url: string, env: NodeJS.ProcessEnv): Promise<number> {
  switch (process.platform) {
    case "darwin":
      return await runInteractive(["open", url], env);
    case "linux":
      return await runInteractive([env.TERMUX_VERSION ? "termux-open-url" : "xdg-open", url], env);
    default:
      throw new Error(`opening PWAs is unsupported on ${process.platform}`);
  }
}

export async function runDeviceFabricAction(options: DeviceFabricRunOptions): Promise<number> {
  const env = options.env ?? process.env;
  const validatedOptions = { ...options, action: requireAction(options.action) };
  if (validatedOptions.target === "local") return await runLocal(validatedOptions, env);

  const target = validateSavedProfile(validatedOptions.target, "remote target");
  if (!allowedRemotes(env).has(target)) {
    throw new Error(`remote target ${target} is not in POLYCAST_DEVICE_FABRIC_REMOTES`);
  }
  validateLocalArguments(validatedOptions);
  tailscalePreflight(env);
  const envelope: RemoteEnvelope = {
    version: 1,
    action: validatedOptions.action,
    destination: validatedOptions.destination,
    files: validatedOptions.files ?? [],
  };
  return await runInteractive(
    ["ssh", target, REMOTE_COMMAND],
    env,
    `${JSON.stringify(envelope)}\n`,
  );
}

function parseRemoteEnvelope(input: string): RemoteEnvelope {
  if (Buffer.byteLength(input) > MAX_REMOTE_PAYLOAD_BYTES) {
    throw new Error("remote device payload exceeds 64 KiB");
  }
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new Error("remote device payload is not valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("remote device payload must be an object");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const allowedKeys = ["action", "destination", "files", "version"];
  if (keys.some((key) => !allowedKeys.includes(key))) {
    throw new Error("remote device payload contains unsupported fields");
  }
  if (record.version !== 1 || typeof record.action !== "string" || !Array.isArray(record.files)) {
    throw new Error("remote device payload has an invalid shape");
  }
  if (!record.files.every((file) => typeof file === "string")) {
    throw new Error("remote device payload files must be strings");
  }
  if (record.destination !== undefined && typeof record.destination !== "string") {
    throw new Error("remote device payload destination must be a string");
  }
  return {
    version: 1,
    action: requireAction(record.action),
    destination: record.destination,
    files: record.files as string[],
  };
}

function readBoundedStdin(): string {
  const buffer = Buffer.allocUnsafe(MAX_REMOTE_PAYLOAD_BYTES + 1);
  let offset = 0;
  while (offset < buffer.byteLength) {
    const bytesRead = readSync(0, buffer, offset, buffer.byteLength - offset, null);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset > MAX_REMOTE_PAYLOAD_BYTES) {
    throw new Error("remote device payload exceeds 64 KiB");
  }
  return buffer.subarray(0, offset).toString("utf8");
}

export async function receiveDeviceFabricAction(
  originalCommand: string | undefined,
  input?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  if (originalCommand !== REMOTE_COMMAND) {
    throw new Error(`refusing remote command: expected ${REMOTE_COMMAND}`);
  }
  const envelope = parseRemoteEnvelope(input ?? readBoundedStdin());
  return await runLocal({ ...envelope, target: "local", env }, env);
}

function extractShortcutName(source: string): string | undefined {
  return /^#define name (.+)$/m.exec(source)?.[1]?.trim();
}

function assertSourceSafe(id: string, source: string): void {
  if (/drop task/i.test(source))
    throw new Error(`${id}.cherri contains retired Drop Task behavior`);
  if (/(bearer\s+|-----BEGIN [A-Z ]+PRIVATE KEY-----|[?&](?:token|access_token)=)/i.test(source)) {
    throw new Error(`${id}.cherri contains credential material`);
  }
}

function patchPlist(path: string, keyPath: string, value: unknown, env: NodeJS.ProcessEnv): void {
  runChecked(["plutil", "-replace", keyPath, "-json", JSON.stringify(value), path], env);
}

function insertPlist(path: string, keyPath: string, value: unknown, env: NodeJS.ProcessEnv): void {
  runChecked(["plutil", "-insert", keyPath, "-json", JSON.stringify(value), path], env);
}

function extractPlist(path: string, keyPath: string, env: NodeJS.ProcessEnv): string {
  const command = ["plutil", "-extract", keyPath, "raw", "-o", "-", path] as const;
  const result = spawnSync(command[0], command.slice(1), { env, encoding: "utf8" });
  if (result.status !== 0) throw commandError(command, result);
  return result.stdout.trim();
}

function patchTailscaleIntents(
  path: string,
  id: DeviceFabricActionId,
  env: NodeJS.ProcessEnv,
): void {
  const connectId = extractPlist(path, "WFWorkflowActions.0.WFWorkflowActionIdentifier", env);
  if (connectId !== "io.tailscale.ipn.ios.ConnectIntent") {
    throw new Error(`${id}.cherri must begin with Tailscale ConnectIntent`);
  }
  patchPlist(
    path,
    "WFWorkflowActions.0.WFWorkflowActionParameters.AppIntentDescriptor",
    { ...TAILSCALE_APP_DESCRIPTOR, AppIntentIdentifier: "ConnectIntent" },
    env,
  );
  const connectUuid = deterministicActionUuid(id, "ConnectIntent");
  insertPlist(path, "WFWorkflowActions.0.WFWorkflowActionParameters.UUID", connectUuid, env);
  const connectBundle = extractPlist(
    path,
    "WFWorkflowActions.0.WFWorkflowActionParameters.AppIntentDescriptor.BundleIdentifier",
    env,
  );
  const emittedConnectUuid = extractPlist(
    path,
    "WFWorkflowActions.0.WFWorkflowActionParameters.UUID",
    env,
  );
  if (connectBundle !== "io.tailscale.ipn.ios" || emittedConnectUuid !== connectUuid) {
    throw new Error(`${id}.cherri emitted invalid Tailscale AppIntent parameters`);
  }
  if (id !== "send-to-device") return;

  const taildropId = extractPlist(path, "WFWorkflowActions.1.WFWorkflowActionIdentifier", env);
  if (taildropId !== "io.tailscale.ipn.ios.TaildropAppIntent") {
    throw new Error("send-to-device.cherri must end with Tailscale TaildropAppIntent");
  }
  patchPlist(
    path,
    "WFWorkflowActions.1.WFWorkflowActionParameters.AppIntentDescriptor",
    { ...TAILSCALE_APP_DESCRIPTOR, AppIntentIdentifier: "TaildropAppIntent" },
    env,
  );
  const taildropUuid = deterministicActionUuid(id, "TaildropAppIntent");
  insertPlist(path, "WFWorkflowActions.1.WFWorkflowActionParameters.UUID", taildropUuid, env);
  patchPlist(
    path,
    "WFWorkflowActions.1.WFWorkflowActionParameters.destination",
    {
      Value: { Type: "Ask", Prompt: "Choose a Taildrop destination" },
      WFSerializationType: "WFTextTokenAttachment",
    },
    env,
  );
  const destinationType = extractPlist(
    path,
    "WFWorkflowActions.1.WFWorkflowActionParameters.destination.Value.Type",
    env,
  );
  const inputType = extractPlist(
    path,
    "WFWorkflowActions.1.WFWorkflowActionParameters.files.Value.Type",
    env,
  );
  const emittedTaildropUuid = extractPlist(
    path,
    "WFWorkflowActions.1.WFWorkflowActionParameters.UUID",
    env,
  );
  if (
    destinationType !== "Ask" ||
    inputType !== "ExtensionInput" ||
    emittedTaildropUuid !== taildropUuid
  ) {
    throw new Error(
      "send-to-device.cherri must ask for a destination and pass Shortcut input files",
    );
  }
}

async function compileDeviceShortcut(
  sourcePath: string,
  outputPath: string,
  id: DeviceFabricActionId,
  name: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const workDir = await mkdtemp(join(tmpdir(), "polycast-device-fabric-"));
  try {
    const localSource = join(workDir, basename(sourcePath));
    await copyFile(sourcePath, localSource);
    runChecked(["cherri", basename(localSource), "--skip-sign", "--derive-uuids"], env, workDir);
    const unsigned = join(workDir, `${name}_unsigned.shortcut`);
    await access(unsigned);
    patchTailscaleIntents(unsigned, id, env);
    runChecked(
      [
        "shortcuts",
        "sign",
        "--mode",
        "people-who-know-me",
        "--input",
        unsigned,
        "--output",
        outputPath,
      ],
      env,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function buildDeviceFabricShortcuts(
  options: DeviceFabricBuildOptions = {},
): Promise<DeviceFabricBuildSummary> {
  const sourceDir = resolve(options.dir ?? "shortcuts/device-fabric");
  const outRoot = resolve(options.out ?? "build/device-fabric");
  const sourceContainsOutput = relative(sourceDir, outRoot);
  const outputContainsSource = relative(outRoot, sourceDir);
  const overlapsSource =
    sourceContainsOutput === "" ||
    outputContainsSource === "" ||
    (sourceContainsOutput !== ".." && !sourceContainsOutput.startsWith(`..${sep}`)) ||
    (outputContainsSource !== ".." && !outputContainsSource.startsWith(`..${sep}`));
  if (overlapsSource) {
    throw new Error("device fabric output must not equal, contain, or be contained by its source");
  }
  const expectedIds = DEVICE_FABRIC_ACTIONS.map((action) => action.id);
  const actualIds = (await readdir(sourceDir))
    .filter((name) => name.endsWith(".cherri"))
    .map((name) => name.replace(/\.cherri$/, ""))
    .sort();
  if (actualIds.join("\n") !== [...expectedIds].sort().join("\n")) {
    throw new Error(`device fabric must contain exactly: ${expectedIds.join(", ")}`);
  }

  await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });
  const sources: string[] = [];
  const sourceRecords: Array<{
    id: DeviceFabricActionId;
    name: string;
    sourcePath: string;
  }> = [];
  for (const action of DEVICE_FABRIC_ACTIONS) {
    const sourcePath = join(sourceDir, `${action.id}.cherri`);
    const source = await readFile(sourcePath, "utf8");
    const name = extractShortcutName(source);
    if (name !== action.name) {
      throw new Error(`${action.id}.cherri must declare '#define name ${action.name}'`);
    }
    assertSourceSafe(action.id, source);
    const outputSource = join(outRoot, `${action.id}.cherri`);
    await writeFile(outputSource, source);
    await writeFile(`${outputSource}${OWNERSHIP_MARKER}`, "polycast\n");
    sources.push(outputSource, `${outputSource}${OWNERSHIP_MARKER}`);
    sourceRecords.push({ id: action.id, name, sourcePath });
  }

  const env = options.env ?? process.env;
  const compileSkipped =
    env.POLYCAST_SKIP_CHERRI === "1" ||
    !commandAvailable("cherri", env) ||
    !commandAvailable("plutil", env) ||
    !commandAvailable("shortcuts", env);
  const shortcuts: string[] = [];
  if (!compileSkipped) {
    for (const record of sourceRecords) {
      const outputPath = join(outRoot, `${record.id}.shortcut`);
      await compileDeviceShortcut(record.sourcePath, outputPath, record.id, record.name, env);
      await writeFile(`${outputPath}${OWNERSHIP_MARKER}`, "polycast\n");
      shortcuts.push(outputPath, `${outputPath}${OWNERSHIP_MARKER}`);
    }
  }

  return { outRoot, sources, shortcuts, compileSkipped };
}

export async function deviceFabricCli(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub === "list") {
    for (const action of DEVICE_FABRIC_ACTIONS) console.log(`${action.id}  ${action.name}`);
    return 0;
  }
  if (sub === "build") {
    let dir: string | undefined;
    let out: string | undefined;
    for (let index = 0; index < rest.length; index += 1) {
      const flag = rest[index];
      const value = rest[index + 1];
      if ((flag === "--dir" || flag === "--out") && value) {
        if (flag === "--dir") dir = value;
        else out = value;
        index += 1;
      } else {
        throw new Error("usage: polycast device build [--dir <source>] [--out <dir>]");
      }
    }
    const summary = await buildDeviceFabricShortcuts({ dir, out });
    for (const path of [...summary.sources, ...summary.shortcuts]) console.log(`emit  ${path}`);
    if (summary.compileSkipped)
      console.log("skip  signed Shortcut compile (Cherri or macOS Shortcuts tooling unavailable)");
    return 0;
  }
  if (sub === "receive") {
    if (rest.length !== 1 || rest[0] !== "--forced") {
      throw new Error("usage: polycast device receive --forced");
    }
    return await receiveDeviceFabricAction(process.env.SSH_ORIGINAL_COMMAND);
  }
  if (sub !== "run") {
    throw new Error("usage: polycast device <list|build|run|receive>");
  }

  const actionValue = rest[0];
  if (!actionValue) throw new Error("usage: polycast device run <action> --target <local|remote>");
  const action = requireAction(actionValue);
  let target: string | undefined;
  let destination: string | undefined;
  const files: string[] = [];
  let positional = false;
  for (let index = 1; index < rest.length; index += 1) {
    const value = rest[index]!;
    if (value === "--") {
      positional = true;
      continue;
    }
    if (!positional && (value === "--target" || value === "--destination")) {
      const next = rest[index + 1];
      if (!next) throw new Error(`${value} requires a value`);
      if (value === "--target") target = next;
      else destination = next;
      index += 1;
      continue;
    }
    if (!positional && value.startsWith("-")) throw new Error(`unknown option: ${value}`);
    files.push(value);
  }
  if (!target)
    throw new Error("device actions require explicit --target <local|authorized-remote>");
  return await runDeviceFabricAction({ action, target, destination, files });
}
