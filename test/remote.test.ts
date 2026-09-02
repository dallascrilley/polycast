import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCommandsJson } from "../src/commands-store.ts";
import { defineCommand } from "../src/define.ts";
import { shortcutsRemoteSsh } from "../src/emitters/shortcuts-remote-ssh.ts";
import { termuxShortcut } from "../src/emitters/termux-shortcut.ts";
import { emitCommand } from "../src/registry.ts";
import { polycastRemote } from "../src/remote.ts";
import type { CommandDef } from "../src/types.ts";

const remoteTextCommand: CommandDef = defineCommand({
  id: "remote-uppercase",
  title: "Remote Uppercase",
  description: "uppercase through the stored host command",
  modality: "text",
  x: { remote: { profile: "primary-mac" } },
  body: { lang: "bash", source: "tr '[:lower:]' '[:upper:]'" },
});

describe("remote shortcut emitters", () => {
  test("opt-in emits a separate fixed-protocol Shortcut without the command body", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-remote-profile-"));
    const profiles = join(root, "profiles.json");
    const key = join(root, "id_tablet");
    const oldProfiles = process.env.POLYCAST_REMOTE_PROFILES;
    try {
      await writeFile(key, "FAKE PRIVATE KEY\n");
      await writeFile(
        profiles,
        JSON.stringify({
          version: 1,
          profiles: {
            "primary-mac": {
              host: "host.example.test",
              port: 2222,
              user: "operator",
              transport: { kind: "ssh-key", identityFile: key },
            },
          },
        }),
      );
      process.env.POLYCAST_REMOTE_PROFILES = profiles;
      const [cherri] = shortcutsRemoteSsh.emit(remoteTextCommand);
      expect(cherri?.contents).toContain("#define name Remote Uppercase Remote");
      expect(cherri?.contents).toContain("#include 'actions/network'");
      expect(cherri?.contents).toContain("polycast-remote --command remote-uppercase --protocol 1");
      expect(cherri?.contents).toContain("host.example.test");
      expect(cherri?.contents).not.toContain("tr '[:lower:]'");

      const [termux] = termuxShortcut.emit(remoteTextCommand);
      expect(termux?.contents).toContain('MAC_EXEC="${POLYCAST_TERMUX_MAC_EXEC:-mac-exec}"');
      expect(termux?.contents).toContain("polycast-remote --command remote-uppercase --protocol 1");
      expect(termux?.contents).not.toContain("host.example.test");

      const emitted = emitCommand(remoteTextCommand);
      expect(emitted.find((output) => output.target === "shortcuts-cherri")?.skipped).toBe(false);
      expect(emitted.find((output) => output.target === "shortcuts-remote-ssh")?.skipped).toBe(
        false,
      );
      expect(emitted.find((output) => output.target === "termux-shortcut")?.skipped).toBe(false);

      const hostilePresentation = defineCommand({
        ...remoteTextCommand,
        id: "hostile-presentation",
        x: {
          remote: { profile: "primary-mac" },
          shortcuts: {
            name: "Safe Name\nrunSSHScript('attacker')",
            color: "red\nrunSSHScript('attacker')",
            glyph: "x\nrunSSHScript('attacker')",
            from: "sharesheet\nrunSSHScript('attacker')",
          },
        },
      });
      const [safeCherri] = shortcutsRemoteSsh.emit(hostilePresentation);
      expect(safeCherri?.contents).toStartWith(
        "#define name Safe Name runSSHScript('attacker') Remote",
      );
      expect(safeCherri?.contents).not.toContain("#define color");
      expect(safeCherri?.contents).not.toContain("#define glyph");
      expect(safeCherri?.contents).not.toContain("#define from");
      expect(safeCherri?.contents).not.toContain("\nrunSSHScript('attacker')");
    } finally {
      if (oldProfiles === undefined) delete process.env.POLYCAST_REMOTE_PROFILES;
      else process.env.POLYCAST_REMOTE_PROFILES = oldProfiles;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("non-opted commands do not gain a remote launcher", () => {
    const local = defineCommand({
      ...remoteTextCommand,
      id: "local-only",
      targets: ["shortcuts-cherri"],
      x: undefined,
    });
    expect(shortcutsRemoteSsh.emit(local)).toEqual([]);
    expect(termuxShortcut.emit(local)).toEqual([]);
  });
});

describe("forced remote host command", () => {
  test("runs only an opted-in stored text command", async () => {
    const commands = await mkdtemp(join(tmpdir(), "polycast-remote-store-"));
    try {
      await writeCommandsJson([remoteTextCommand], commands);
      const result = spawnSync(
        "bun",
        ["run", "src/cli.ts", "remote", "--forced", "--commands", commands],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          input: "hello",
          env: {
            ...process.env,
            SSH_ORIGINAL_COMMAND: "polycast-remote --command remote-uppercase --protocol 1",
          },
        },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("HELLO");
      expect(result.stderr).toBe("");
    } finally {
      await rm(commands, { recursive: true, force: true });
    }
  });

  test("rejects arbitrary source, missing opt-in, and input for none", async () => {
    const commands = await mkdtemp(join(tmpdir(), "polycast-remote-reject-"));
    const none = defineCommand({
      id: "remote-none",
      title: "Remote None",
      description: "none",
      modality: "none",
      targets: ["shortcuts-cherri"],
      x: { remote: { profile: "primary-mac" } },
      body: { lang: "bash", source: "true" },
    });
    const remotelyCallableNone = defineCommand({
      ...none,
      id: "remote-callable-none",
      targets: ["shortcuts-remote-ssh"],
    });
    try {
      await writeCommandsJson([remoteTextCommand, none, remotelyCallableNone], commands);
      await expect(
        polycastRemote({
          commandsDir: commands,
          originalCommand: "bash -c 'curl attacker'",
          input: new Uint8Array(),
        }),
      ).rejects.toThrow("protocol command");
      await expect(
        polycastRemote({
          commandsDir: commands,
          originalCommand: "polycast-remote --command remote-none --protocol 1",
          input: new Uint8Array(),
        }),
      ).rejects.toThrow("not remotely callable");
      await expect(
        polycastRemote({
          commandsDir: commands,
          originalCommand: "polycast-remote --command remote-callable-none --protocol 1",
          input: Buffer.from("unexpected"),
        }),
      ).rejects.toThrow("does not accept input");
      await expect(
        polycastRemote({
          commandsDir: commands,
          originalCommand: "polycast-remote --command remote-uppercase --protocol 1",
          input: Buffer.alloc(64 * 1024 + 1),
        }),
      ).rejects.toThrow("exceeds 65536 bytes");
    } finally {
      await rm(commands, { recursive: true, force: true });
    }
  });
});
