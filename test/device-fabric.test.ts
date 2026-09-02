import { describe, expect, test } from "bun:test";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
