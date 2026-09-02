import { describe, expect, test } from "bun:test";
import {
  access,
  appendFile,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  watch,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  buildDeviceFabricShortcuts,
  DEVICE_FABRIC_ACTIONS,
  deviceFabricIntentSpecs,
  receiveDeviceFabricAction,
  runDeviceFabricAction,
} from "../src/device-fabric.ts";

const sourceDir = resolve(import.meta.dir, "..", "shortcuts", "device-fabric");

async function writeExecutable(binDir: string, name: string, body: string): Promise<void> {
  const path = join(binDir, name);
  await writeFile(path, `#!/bin/sh\nset -eu\n${body}\n`);
  await chmod(path, 0o755);
}

async function waitForPath(path: string): Promise<void> {
  try {
    await access(path);
    return;
  } catch {}

  const controller = new AbortController();
  const watcher = watch(dirname(path), { signal: controller.signal });
  try {
    try {
      await access(path);
      return;
    } catch {}
    for await (const event of watcher) {
      if (event.filename === basename(path)) {
        await access(path);
        return;
      }
    }
    throw new Error(`stopped waiting for ${path}`);
  } finally {
    controller.abort();
  }
}

async function createBuildTools(root: string) {
  const bin = join(root, "bin");
  const log = join(root, "compile.log");
  const barrier = join(root, "barrier");
  const release = join(barrier, "release");
  await mkdir(bin);
  await mkdir(barrier);
  const fifo = Bun.spawnSync(["mkfifo", release]);
  if (fifo.exitCode !== 0) throw new Error("mkfifo failed");
  await writeFile(log, "");
  await writeExecutable(
    bin,
    "cherri",
    `case "$1" in
  agents.cherri) name='Agents';;
  reviews.cherri) name='Reviews';;
  agent-console.cherri) name='Agent Console';;
  send-to-device.cherri) name='Send to Device';;
  *) exit 2;;
esac
contents="$(cat "$1")"
case "$contents" in *SOURCE_A*) marker=A;; *SOURCE_B*) marker=B;; *) marker=none;; esac
printf '%s\\t%s\\t%s\\n' "$POLYCAST_TEST_BUILD" "$name" "$marker" >> "$POLYCAST_TEST_LOG"
if [ "$POLYCAST_TEST_BUILD" = A ] && [ "$1" = agents.cherri ]; then
  : > "$POLYCAST_TEST_BARRIER/a"
  cat "$POLYCAST_TEST_BARRIER/release" > /dev/null
fi
if [ "$POLYCAST_TEST_BUILD" = B ] && [ "$1" = agents.cherri ]; then
  printf 'release\n' > "$POLYCAST_TEST_BARRIER/release"
fi
cp "$1" "\${name}_unsigned.shortcut"`,
  );
  await writeExecutable(
    bin,
    "plutil",
    `if [ "$1" = -extract ]; then
  case "$2" in
    WFWorkflowActions.0.WFWorkflowActionIdentifier) printf '%s\\n' 'io.tailscale.ipn.ios.ConnectIntent';;
    WFWorkflowActions.1.WFWorkflowActionIdentifier) printf '%s\\n' 'io.tailscale.ipn.ios.TaildropAppIntent';;
    WFWorkflowActions.0.WFWorkflowActionParameters.AppIntentDescriptor.BundleIdentifier) printf '%s\\n' 'io.tailscale.ipn.ios';;
    WFWorkflowActions.1.WFWorkflowActionParameters.AppIntentDescriptor.BundleIdentifier) printf '%s\\n' 'io.tailscale.ipn.ios';;
    WFWorkflowActions.0.WFWorkflowActionParameters.UUID)
      case "$6" in
        *Agents_unsigned.shortcut) printf '%s\\n' "$POLYCAST_TEST_UUID_AGENTS";;
        *Reviews_unsigned.shortcut) printf '%s\\n' "$POLYCAST_TEST_UUID_REVIEWS";;
        *'Agent Console_unsigned.shortcut') printf '%s\\n' "$POLYCAST_TEST_UUID_CONSOLE";;
        *'Send to Device_unsigned.shortcut') printf '%s\\n' "$POLYCAST_TEST_UUID_SEND0";;
        *) exit 3;;
      esac;;
    WFWorkflowActions.1.WFWorkflowActionParameters.UUID) printf '%s\\n' "$POLYCAST_TEST_UUID_SEND1";;
    WFWorkflowActions.1.WFWorkflowActionParameters.destination.Value.Type) printf '%s\\n' Ask;;
    WFWorkflowActions.1.WFWorkflowActionParameters.files.Value.Type) printf '%s\\n' ExtensionInput;;
    *) exit 4;;
  esac
fi`,
  );
  await writeExecutable(
    bin,
    "shortcuts",
    `input=''
output=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --input) input="$2"; shift 2;;
    --output) output="$2"; shift 2;;
    *) shift;;
  esac
done
cp "$input" "$output"`,
  );
  return {
    log,
    barrier,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      POLYCAST_TEST_LOG: log,
      POLYCAST_TEST_BARRIER: barrier,
    },
  };
}

async function createRuntime(backendState = "Running") {
  const root = await mkdtemp(join(tmpdir(), "polycast-device-fabric-test-"));
  const bin = join(root, "bin");
  const log = join(root, "commands.log");
  const payload = join(root, "payload.json");
  await writeFile(log, "");
  await writeFile(payload, "");
  await mkdir(bin);
  const record = `printf '%s' "$0" >> "$POLYCAST_TEST_LOG"; for arg in "$@"; do printf '\\t%s' "$arg" >> "$POLYCAST_TEST_LOG"; done; printf '\\n' >> "$POLYCAST_TEST_LOG"`;
  await writeExecutable(
    bin,
    "tailscale",
    `${record}\nif [ "${"$"}1" = status ]; then printf '%s\\n' '{"BackendState":"${backendState}"}'; fi`,
  );
  for (const name of ["open", "xdg-open", "termux-open-url", "ssh", "mosh"]) {
    const receive = name === "ssh" ? `\ncat > "$POLYCAST_TEST_PAYLOAD"` : "";
    await writeExecutable(bin, name, `${record}${receive}`);
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin`,
    POLYCAST_TEST_LOG: log,
    POLYCAST_TEST_PAYLOAD: payload,
  };
  return { root, log, payload, env };
}

async function loggedCommands(path: string): Promise<string[]> {
  return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean);
}

describe("device fabric", () => {
  test("exports exactly the four Cherri sources without secrets or Drop Task", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-device-fabric-build-"));
    try {
      const out = join(root, "build");
      const summary = await buildDeviceFabricShortcuts({
        dir: sourceDir,
        out,
        env: { ...process.env, POLYCAST_SKIP_CHERRI: "1" },
      });
      const sourceNames = summary.sources
        .filter((path) => path.endsWith(".cherri"))
        .map((path) => path.split("/").at(-1))
        .sort();
      expect(sourceNames).toEqual([
        "agent-console.cherri",
        "agents.cherri",
        "reviews.cherri",
        "send-to-device.cherri",
      ]);
      expect(await readdir(out)).toHaveLength(8);
      expect(DEVICE_FABRIC_ACTIONS.map((action) => action.name)).toEqual([
        "Agents",
        "Reviews",
        "Agent Console",
        "Send to Device",
      ]);

      const sourceText = (
        await Promise.all(sourceNames.map((name) => readFile(join(out, name!), "utf8")))
      ).join("\n");
      expect(sourceText).not.toMatch(/drop task/i);
      expect(sourceText).not.toMatch(
        /bearer\s+|-----BEGIN [A-Z ]+PRIVATE KEY-----|[?&](token|access_token)=/i,
      );
      expect(sourceText).not.toContain("runShellScript");
      expect(sourceText).toContain("io.tailscale.ipn.ios.ConnectIntent");
      expect(sourceText).toContain("io.tailscale.ipn.ios.TaildropAppIntent");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses build outputs that overlap the canonical source tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-device-fabric-overlap-"));
    const isolatedSource = join(root, "source");
    await mkdir(isolatedSource);
    for (const action of DEVICE_FABRIC_ACTIONS) {
      await copyFile(
        join(sourceDir, `${action.id}.cherri`),
        join(isolatedSource, `${action.id}.cherri`),
      );
    }
    const sourceAlias = join(root, "SOURCE-ALIAS");
    await symlink(isolatedSource, sourceAlias, "dir");
    try {
      await expect(
        buildDeviceFabricShortcuts({
          dir: isolatedSource,
          out: root,
          env: { ...process.env, POLYCAST_SKIP_CHERRI: "1" },
        }),
      ).rejects.toThrow("must not equal, contain, or be contained by its source");
      await expect(
        buildDeviceFabricShortcuts({
          dir: isolatedSource,
          out: sourceAlias,
          env: { ...process.env, POLYCAST_SKIP_CHERRI: "1" },
        }),
      ).rejects.toThrow("must not equal, contain, or be contained by its source");
      expect(await readdir(isolatedSource)).toHaveLength(4);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("validates every source before replacing prior build output", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-device-fabric-preflight-"));
    const isolatedSource = join(root, "source");
    const out = join(root, "build");
    await mkdir(isolatedSource);
    await mkdir(out);
    for (const action of DEVICE_FABRIC_ACTIONS) {
      await copyFile(
        join(sourceDir, `${action.id}.cherri`),
        join(isolatedSource, `${action.id}.cherri`),
      );
    }
    await writeFile(join(isolatedSource, "reviews.cherri"), "#define name Wrong Reviews\n");
    const priorArtifact = join(out, "last-good.shortcut");
    await writeFile(priorArtifact, "last-good");
    try {
      await expect(
        buildDeviceFabricShortcuts({
          dir: isolatedSource,
          out,
          env: { ...process.env, POLYCAST_SKIP_CHERRI: "1" },
        }),
      ).rejects.toThrow("reviews.cherri must declare '#define name Reviews'");
      expect(await readFile(priorArtifact, "utf8")).toBe("last-good");
      expect(await readdir(out)).toEqual(["last-good.shortcut"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("preserves prior output when Cherri compilation fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-device-fabric-compile-failure-"));
    const isolatedSource = join(root, "source");
    const out = join(root, "build");
    const bin = join(root, "bin");
    await mkdir(isolatedSource);
    await mkdir(out);
    await mkdir(bin);
    for (const action of DEVICE_FABRIC_ACTIONS) {
      await copyFile(
        join(sourceDir, `${action.id}.cherri`),
        join(isolatedSource, `${action.id}.cherri`),
      );
    }
    await writeExecutable(bin, "cherri", "exit 7");
    await writeExecutable(bin, "plutil", ":");
    await writeExecutable(bin, "shortcuts", ":");
    const priorArtifact = join(out, "last-good.shortcut");
    await writeFile(priorArtifact, "last-good");
    try {
      await expect(
        buildDeviceFabricShortcuts({
          dir: isolatedSource,
          out,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            POLYCAST_SKIP_CHERRI: "0",
          },
        }),
      ).rejects.toThrow("cherri");
      expect(await readFile(priorArtifact, "utf8")).toBe("last-good");
      expect(await readdir(out)).toEqual(["last-good.shortcut"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("reclaims malformed publication locks", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-device-fabric-stale-lock-"));
    const out = join(root, "build");
    const lockPath = join(root, ".build.publish.lock");
    await symlink("invalid-owner", lockPath);
    try {
      const summary = await buildDeviceFabricShortcuts({
        dir: sourceDir,
        out,
        env: { ...process.env, POLYCAST_SKIP_CHERRI: "1" },
      });
      expect(summary.compileSkipped).toBe(true);
      expect(await readdir(out)).toHaveLength(8);
      await expect(access(lockPath)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("isolates concurrent compilation inputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-device-fabric-concurrent-"));
    const sourceA = join(root, "source-a");
    const sourceB = join(root, "source-b");
    const out = join(root, "build");
    await mkdir(sourceA);
    await mkdir(sourceB);
    await mkdir(out);
    for (const action of DEVICE_FABRIC_ACTIONS) {
      const sourcePath = join(sourceDir, `${action.id}.cherri`);
      await copyFile(sourcePath, join(sourceA, `${action.id}.cherri`));
      await copyFile(sourcePath, join(sourceB, `${action.id}.cherri`));
      await appendFile(join(sourceA, `${action.id}.cherri`), "\n// SOURCE_A\n");
      await appendFile(join(sourceB, `${action.id}.cherri`), "\n// SOURCE_B\n");
    }
    const tools = await createBuildTools(root);
    const specs = DEVICE_FABRIC_ACTIONS.map((action) => deviceFabricIntentSpecs(action.id));
    const env = {
      ...tools.env,
      POLYCAST_SKIP_CHERRI: "0",
      POLYCAST_TEST_UUID_AGENTS: specs[0]![0]!.uuid,
      POLYCAST_TEST_UUID_REVIEWS: specs[1]![0]!.uuid,
      POLYCAST_TEST_UUID_CONSOLE: specs[2]![0]!.uuid,
      POLYCAST_TEST_UUID_SEND0: specs[3]![0]!.uuid,
      POLYCAST_TEST_UUID_SEND1: specs[3]![1]!.uuid,
    };
    try {
      const repo = resolve(import.meta.dir, "..");
      const startBuild = (dir: string, build: string) =>
        Bun.spawn(
          [
            "bun",
            "run",
            join(repo, "src", "cli.ts"),
            "device",
            "build",
            "--dir",
            dir,
            "--out",
            out,
          ],
          {
            cwd: repo,
            env: { ...env, POLYCAST_TEST_BUILD: build },
            stdout: "ignore",
            stderr: "pipe",
          },
        );
      const processA = startBuild(sourceA, "A");
      await waitForPath(join(tools.barrier, "a"));
      const processB = startBuild(sourceB, "B");
      const [codeA, errorA, codeB, errorB] = await Promise.all([
        processA.exited,
        new Response(processA.stderr).text(),
        processB.exited,
        new Response(processB.stderr).text(),
      ]);
      expect({ codeA, errorA, codeB, errorB }).toEqual({
        codeA: 0,
        errorA: "",
        codeB: 0,
        errorB: "",
      });
      const records = (await readFile(tools.log, "utf8"))
        .trim()
        .split("\n")
        .map((line) => line.split("\t"));
      expect(
        records.filter(([build]) => build === "A").map(([, name, marker]) => `${name}:${marker}`),
      ).toEqual(["Agents:A", "Reviews:A", "Agent Console:A", "Send to Device:A"]);
      expect(
        records.filter(([build]) => build === "B").map(([, name, marker]) => `${name}:${marker}`),
      ).toEqual(["Agents:B", "Reviews:B", "Agent Console:B", "Send to Device:B"]);
      expect(await readdir(out)).toHaveLength(16);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("describes deterministic native AppIntent patches before signing", () => {
    const first = DEVICE_FABRIC_ACTIONS.flatMap((action) => deviceFabricIntentSpecs(action.id));
    const second = DEVICE_FABRIC_ACTIONS.flatMap((action) => deviceFabricIntentSpecs(action.id));
    expect(first).toEqual(second);
    expect(first).toHaveLength(5);
    expect(first.map((spec) => spec.identifier)).toEqual([
      "io.tailscale.ipn.ios.ConnectIntent",
      "io.tailscale.ipn.ios.ConnectIntent",
      "io.tailscale.ipn.ios.ConnectIntent",
      "io.tailscale.ipn.ios.ConnectIntent",
      "io.tailscale.ipn.ios.TaildropAppIntent",
    ]);
    for (const spec of first) {
      expect(spec.descriptor).toEqual({
        AppIntentIdentifier: spec.identifier.slice(spec.identifier.lastIndexOf(".") + 1),
        BundleIdentifier: "io.tailscale.ipn.ios",
        TeamIdentifier: "W5364U7YZB",
        Name: "Tailscale",
      });
      expect(spec.uuid).toMatch(
        /^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/,
      );
    }
    expect(new Set(first.map((spec) => spec.uuid)).size).toBe(5);
  });

  test("routes Agents and Reviews only after a successful Tailscale preflight", async () => {
    const runtime = await createRuntime();
    try {
      expect(
        await runDeviceFabricAction({ action: "agents", target: "local", env: runtime.env }),
      ).toBe(0);
      expect(
        await runDeviceFabricAction({ action: "reviews", target: "local", env: runtime.env }),
      ).toBe(0);
      const commands = await loggedCommands(runtime.log);
      expect(commands).toEqual([
        expect.stringContaining("tailscale\tstatus\t--json"),
        expect.stringContaining("open\thttps://dallas-macbook.tail16923a.ts.net/agents"),
        expect.stringContaining("tailscale\tstatus\t--json"),
        expect.stringContaining("open\thttps://dallas-macbook.tail16923a.ts.net/reviews"),
      ]);
    } finally {
      await rm(runtime.root, { recursive: true, force: true });
    }
  });

  test("fails closed before routing when Tailscale is stopped", async () => {
    const runtime = await createRuntime("Stopped");
    try {
      await expect(
        runDeviceFabricAction({ action: "agents", target: "local", env: runtime.env }),
      ).rejects.toThrow("Tailscale preflight failed");
      const commands = await loggedCommands(runtime.log);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toContain("tailscale\tstatus\t--json");
    } finally {
      await rm(runtime.root, { recursive: true, force: true });
    }
  });

  test("rejects inherited action names and PWA query parameters", async () => {
    const runtime = await createRuntime();
    try {
      await expect(
        runDeviceFabricAction({
          action: "toString" as "agents",
          target: "local",
          env: runtime.env,
        }),
      ).rejects.toThrow("unknown device action");
      await expect(
        runDeviceFabricAction({
          action: "agents",
          target: "local",
          env: {
            ...runtime.env,
            POLYCAST_DEVICE_FABRIC_AGENTS_URL:
              "https://dallas-macbook.tail16923a.ts.net/agents?view=compact",
          },
        }),
      ).rejects.toThrow("without credentials, query, port, or fragment");
      const commands = await loggedCommands(runtime.log);
      expect(commands).toEqual([expect.stringContaining("tailscale\tstatus\t--json")]);
    } finally {
      await rm(runtime.root, { recursive: true, force: true });
    }
  });

  test("Agent Console invokes only a configured saved profile", async () => {
    const runtime = await createRuntime();
    try {
      await expect(
        runDeviceFabricAction({
          action: "agent-console",
          target: "local",
          files: ["shared arbitrary text"],
          env: runtime.env,
        }),
      ).rejects.toThrow("does not accept destination, file, or shared-text input");

      expect(
        await runDeviceFabricAction({
          action: "agent-console",
          target: "local",
          env: {
            ...runtime.env,
            POLYCAST_DEVICE_FABRIC_CONSOLE_TRANSPORT: "mosh",
            POLYCAST_DEVICE_FABRIC_CONSOLE_PROFILE: "saved-console",
          },
        }),
      ).toBe(0);
      const commands = await loggedCommands(runtime.log);
      expect(commands).toEqual([
        expect.stringContaining("tailscale\tstatus\t--json"),
        expect.stringContaining("mosh\tsaved-console"),
      ]);
    } finally {
      await rm(runtime.root, { recursive: true, force: true });
    }
  });

  test("Taildrop requires an explicit destination and preserves each file argument", async () => {
    const runtime = await createRuntime();
    const first = join(runtime.root, "first file.txt");
    const second = join(runtime.root, "second.txt");
    await writeFile(first, "first");
    await writeFile(second, "second");
    try {
      await expect(
        runDeviceFabricAction({
          action: "send-to-device",
          target: "local",
          files: [first],
          env: runtime.env,
        }),
      ).rejects.toThrow("requires --destination");

      await expect(
        runDeviceFabricAction({
          action: "send-to-device",
          target: "local",
          destination: "tablet",
          files: [runtime.root],
          env: runtime.env,
        }),
      ).rejects.toThrow("Taildrop input is not a file");

      expect(
        await runDeviceFabricAction({
          action: "send-to-device",
          target: "local",
          destination: "tablet",
          files: [first, second],
          env: runtime.env,
        }),
      ).toBe(0);
      const commands = await loggedCommands(runtime.log);
      expect(commands).toEqual([
        expect.stringContaining("tailscale\tstatus\t--json"),
        expect.stringContaining("tailscale\tstatus\t--json"),
        expect.stringContaining(`tailscale\tfile\tcp\t${first}\t${second}\ttablet:`),
      ]);
    } finally {
      await rm(runtime.root, { recursive: true, force: true });
    }
  });

  test("remote routing uses an allowlisted SSH profile and a fixed JSON protocol", async () => {
    const runtime = await createRuntime();
    try {
      await expect(
        runDeviceFabricAction({ action: "reviews", target: "unlisted", env: runtime.env }),
      ).rejects.toThrow("not in POLYCAST_DEVICE_FABRIC_REMOTES");
      expect(
        await runDeviceFabricAction({
          action: "reviews",
          target: "saved-mac",
          env: { ...runtime.env, POLYCAST_DEVICE_FABRIC_REMOTES: "saved-mac" },
        }),
      ).toBe(0);
      const commands = await loggedCommands(runtime.log);
      expect(commands).toEqual([
        expect.stringContaining("tailscale\tstatus\t--json"),
        expect.stringContaining("ssh\tsaved-mac\tpolycast device receive --forced"),
      ]);
      expect(JSON.parse(await readFile(runtime.payload, "utf8"))).toEqual({
        version: 1,
        action: "reviews",
        files: [],
      });
    } finally {
      await rm(runtime.root, { recursive: true, force: true });
    }
  });

  test("remote receiver accepts only the forced command and bounded action schema", async () => {
    const runtime = await createRuntime();
    try {
      await expect(
        receiveDeviceFabricAction("polycast device receive --other", "{}", runtime.env),
      ).rejects.toThrow("refusing remote command");
      await expect(
        receiveDeviceFabricAction(
          "polycast device receive --forced",
          JSON.stringify({ version: 1, action: "reviews", files: [], command: "uname" }),
          runtime.env,
        ),
      ).rejects.toThrow("unsupported fields");
      await expect(
        receiveDeviceFabricAction(
          "polycast device receive --forced",
          JSON.stringify({ version: 1, action: "constructor", files: [] }),
          runtime.env,
        ),
      ).rejects.toThrow("unknown device action");
      await expect(
        receiveDeviceFabricAction(
          "polycast device receive --forced",
          "x".repeat(64 * 1024 + 1),
          runtime.env,
        ),
      ).rejects.toThrow("exceeds 64 KiB");
      expect(
        await receiveDeviceFabricAction(
          "polycast device receive --forced",
          JSON.stringify({ version: 1, action: "reviews", files: [] }),
          runtime.env,
        ),
      ).toBe(0);
    } finally {
      await rm(runtime.root, { recursive: true, force: true });
    }
  });
});
