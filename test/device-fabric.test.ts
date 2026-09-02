/**
 * WKS-1546: the four bounded WKS-1420 iPhone device-fabric Shortcuts —
 * Agents, Reviews, Agent Console, Send to Device.
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shortcutsCherri } from "../src/emitters/shortcuts-cherri.ts";
import { shortcutsRemoteSsh } from "../src/emitters/shortcuts-remote-ssh.ts";
import { termuxShortcut } from "../src/emitters/termux-shortcut.ts";
import { loadCommands } from "../src/load.ts";
import { cherriAvailable } from "../src/post-build.ts";
import type { CommandDef } from "../src/types.ts";

const REQUIRED_NAMES = ["Agents", "Reviews", "Agent Console", "Send to Device"];
const HEALTH_URL = "https://dallas-macbook.tail16923a.ts.net:8445/health";

async function loadDeviceFabricCommands(): Promise<Map<string, CommandDef>> {
  const all = await loadCommands("commands");
  return new Map(all.map((cmd) => [cmd.id, cmd]));
}

/** Look up a command by id, throwing (not `undefined`) if it is missing. */
function cmdOf(commands: Map<string, CommandDef>, id: string): CommandDef {
  const cmd = commands.get(id);
  if (!cmd) throw new Error(`command not found: "${id}"`);
  return cmd;
}

/** Narrow a command's universal script source; every device-fabric command is `lang: "bash"`. */
function scriptSource(cmd: CommandDef): string {
  if (cmd.body.lang === "exec") {
    throw new Error(`command "${cmd.id}" has an exec body, not a script`);
  }
  return cmd.body.source;
}

describe("WKS-1420 device-fabric route selection", () => {
  test("exactly four commands carry the four required exact names", async () => {
    const commands = await loadDeviceFabricCommands();
    const named = ["agents", "reviews", "agent-console", "send-to-device"].map(
      (id) => cmdOf(commands, id).x?.shortcuts?.name,
    );
    expect(named).toEqual(REQUIRED_NAMES);
  });

  test("agents and reviews route to distinct fixed private PWA URLs", async () => {
    const commands = await loadDeviceFabricCommands();
    const [agents] = shortcutsCherri.emit(cmdOf(commands, "agents"));
    const [reviews] = shortcutsCherri.emit(cmdOf(commands, "reviews"));
    expect(agents?.contents).toContain(
      'openURL("https://dallas-macbook.tail16923a.ts.net/agents")',
    );
    expect(reviews?.contents).toContain(
      'openURL("https://dallas-macbook.tail16923a.ts.net/reviews")',
    );
    const reviewsUrlLine = reviews?.contents.match(/openURL\("[^"]+"\)/)?.[0] ?? "";
    expect(agents?.contents).not.toContain(reviewsUrlLine);
  });
});

describe("WKS-1420 Tailscale preflight", () => {
  test("every device-fabric command checks tailnet reachability before its destination action", async () => {
    const commands = await loadDeviceFabricCommands();
    for (const id of ["agents", "reviews"]) {
      const [file] = shortcutsCherri.emit(cmdOf(commands, id));
      const contents = file?.contents ?? "";
      const preflightAt = contents.indexOf(`downloadURL("${HEALTH_URL}")`);
      const openAt = contents.indexOf("openURL(");
      expect(preflightAt).toBeGreaterThanOrEqual(0);
      expect(openAt).toBeGreaterThan(preflightAt);
    }
  });

  test("universal agents/reviews scripts fail closed when the tailnet is unreachable", async () => {
    const commands = await loadDeviceFabricCommands();
    for (const id of ["agents", "reviews"]) {
      const source = scriptSource(cmdOf(commands, id));
      expect(source).toContain("curl --fail");
      expect(source).toContain("connect Tailscale first");
      expect(source).toContain("exit 1");
    }
  });
});

describe("WKS-1420 native workflow never falls back to the shell dispatcher", () => {
  test("no device-fabric .cherri source ever contains runShellScript", async () => {
    const commands = await loadDeviceFabricCommands();
    for (const id of ["agents", "reviews"]) {
      const [file] = shortcutsCherri.emit(cmdOf(commands, id));
      expect(file?.contents).not.toContain("runShellScript");
      expect(file?.contents).not.toContain("run --commands");
    }
  });

  test("validate flags a workflow command whose output regressed to the shell dispatcher", async () => {
    const commands = await loadDeviceFabricCommands();
    const agents = cmdOf(commands, "agents");
    const [file] = shortcutsCherri.emit(agents);
    if (!file) throw new Error("agents did not emit a .cherri file");
    const tampered = { ...file, contents: `${file.contents}\nrunShellScript('echo hi')` };
    const issues = shortcutsCherri.validate?.(agents, [tampered]) ?? [];
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });
});

describe("WKS-1420 saved-console-only Agent Console behavior", () => {
  test("polycast's own SSH dispatcher never gains an Agent Console launcher", async () => {
    const commands = await loadDeviceFabricCommands();
    const agentConsole = cmdOf(commands, "agent-console");
    expect(shortcutsRemoteSsh.emit(agentConsole)).toEqual([]);
    expect(termuxShortcut.emit(agentConsole)).toEqual([]);
  });

  test("source never embeds a Blink URL key or host — only a private profile name", async () => {
    const source = await Bun.file("commands/agent-console.ts").text();
    expect(source).toContain('profile: "dallas-macbook"');
    expect(source).not.toMatch(/blinkKey|hostAlias/);
  });

  test("without a captured console profile, shortcuts-cherri skips Agent Console instead of failing the build", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-console-missing-"));
    const prev = process.env.POLYCAST_CONSOLE_PROFILES;
    process.env.POLYCAST_CONSOLE_PROFILES = join(root, "does-not-exist.json");
    try {
      const commands = await loadDeviceFabricCommands();
      expect(shortcutsCherri.emit(cmdOf(commands, "agent-console"))).toEqual([]);
    } finally {
      if (prev === undefined) delete process.env.POLYCAST_CONSOLE_PROFILES;
      else process.env.POLYCAST_CONSOLE_PROFILES = prev;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a captured profile compiles a fixed mosh command, never arbitrary shared text", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-console-profile-"));
    const profiles = join(root, "console-profiles.json");
    const prev = process.env.POLYCAST_CONSOLE_PROFILES;
    try {
      await writeFile(
        profiles,
        JSON.stringify({
          version: 1,
          profiles: { "dallas-macbook": { blinkKey: "test-key", hostAlias: "mac" } },
        }),
      );
      process.env.POLYCAST_CONSOLE_PROFILES = profiles;
      const commands = await loadDeviceFabricCommands();
      const [file] = shortcutsCherri.emit(cmdOf(commands, "agent-console"));
      expect(file?.contents).toContain('openURL("blinkshell://run?key=test-key&cmd=mosh%20mac")');
      expect(file?.contents).not.toContain("runShellScript");
      expect(file?.contents).not.toContain("ShortcutInput");

      if (cherriAvailable()) {
        const src = join(root, "agent-console.cherri");
        await writeFile(src, file?.contents ?? "");
        const compiled = spawnSync(
          "cherri",
          [src, "--skip-sign", `-o=${join(root, "agent-console.shortcut")}`],
          { encoding: "utf8" },
        );
        expect(compiled.status).toBe(0);
      }
    } finally {
      if (prev === undefined) delete process.env.POLYCAST_CONSOLE_PROFILES;
      else process.env.POLYCAST_CONSOLE_PROFILES = prev;
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("WKS-1420 explicit Taildrop destination handling", () => {
  test("the universal send-to-device script never hardcodes a destination", async () => {
    const commands = await loadDeviceFabricCommands();
    const source = scriptSource(cmdOf(commands, "send-to-device"));
    expect(source).toContain("POLYCAST_SEND_TO_DEVICE_TARGET");
    expect(source).toContain("read -r -p");
    expect(source).toContain("exit 1");
    expect(source).not.toMatch(/tailscale file cp "\$@" "[a-zA-Z0-9.-]+:"/);
  });

  test("source never embeds the captured native action's identifier or params", async () => {
    const source = await Bun.file("commands/send-to-device.ts").text();
    expect(source).toContain('capture: "tailscale-send-file"');
    expect(source).not.toMatch(/appintent|WFInput/i);
  });

  test("without a captured native action, shortcuts-cherri skips Send to Device instead of failing the build", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-capture-missing-"));
    const prev = process.env.POLYCAST_NATIVE_ACTIONS;
    process.env.POLYCAST_NATIVE_ACTIONS = join(root, "does-not-exist.json");
    try {
      const commands = await loadDeviceFabricCommands();
      expect(shortcutsCherri.emit(cmdOf(commands, "send-to-device"))).toEqual([]);
    } finally {
      if (prev === undefined) delete process.env.POLYCAST_NATIVE_ACTIONS;
      else process.env.POLYCAST_NATIVE_ACTIONS = prev;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a captured action compiles the exact decompiled rawAction faithfully", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-capture-"));
    const captures = join(root, "native-actions.json");
    const prev = process.env.POLYCAST_NATIVE_ACTIONS;
    try {
      await writeFile(
        captures,
        JSON.stringify({
          version: 1,
          actions: {
            "tailscale-send-file": {
              identifier: "is.workflow.actions.appintent",
              params: { WFInput: "${@shortcutInput}" },
            },
          },
        }),
      );
      process.env.POLYCAST_NATIVE_ACTIONS = captures;
      const commands = await loadDeviceFabricCommands();
      const [file] = shortcutsCherri.emit(cmdOf(commands, "send-to-device"));
      expect(file?.contents).toContain(
        'rawAction("is.workflow.actions.appintent", {"WFInput": "${@shortcutInput}"})',
      );
      expect(file?.contents).not.toContain("runShellScript");
      expect(file?.contents).toContain("@shortcutInput = ShortcutInput");

      if (cherriAvailable()) {
        const src = join(root, "send-to-device.cherri");
        await writeFile(src, file?.contents ?? "");
        const compiled = spawnSync(
          "cherri",
          [src, "--skip-sign", `-o=${join(root, "send-to-device.shortcut")}`],
          { encoding: "utf8" },
        );
        expect(compiled.status).toBe(0);
      }
    } finally {
      if (prev === undefined) delete process.env.POLYCAST_NATIVE_ACTIONS;
      else process.env.POLYCAST_NATIVE_ACTIONS = prev;
      await rm(root, { recursive: true, force: true });
    }
  });
});
