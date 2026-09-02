import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyBuilt } from "../src/apply.ts";
import { commandDefToModule } from "../src/command-source.ts";
import { writeCommandsJson } from "../src/commands-store.ts";
import { defineCommand } from "../src/define.ts";
import { shortcutsRemoteSsh } from "../src/emitters/shortcuts-remote-ssh.ts";
import { termuxShortcut } from "../src/emitters/termux-shortcut.ts";
import { polycastApply, polycastBuild, polycastList } from "../src/polycast-api.ts";
import { cherriAvailable } from "../src/post-build.ts";
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

const remoteNoneCommand: CommandDef = defineCommand({
  ...remoteTextCommand,
  id: "remote-none",
  title: "Remote None",
  modality: "none",
});

describe("remote shortcut emitters", () => {
  test("opt-in emits a separate fixed-protocol Shortcut without the command body", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-remote-profile-"));
    const profiles = join(root, "profiles.json");
    const oldProfiles = process.env.POLYCAST_REMOTE_PROFILES;
    try {
      await writeFile(
        profiles,
        JSON.stringify({
          version: 1,
          profiles: {
            "primary-mac": {
              host: "host.example.test",
              port: 2222,
              user: "operator",
              transport: { kind: "ssh-key" },
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
      expect(cherri?.contents).toContain("'SSH Key', '')");
      expect(cherri?.contents).not.toContain("PRIVATE KEY");

      const substringBody = defineCommand({
        ...remoteTextCommand,
        id: "remote-id",
        body: { lang: "bash", source: "id" },
      });
      const [substringCherri] = shortcutsRemoteSsh.emit(substringBody);
      expect(
        shortcutsRemoteSsh.validate?.(substringBody, substringCherri ? [substringCherri] : []),
      ).toEqual([]);
      const appendedBody = (substringCherri?.contents ?? "").replace(
        ", 'SSH Key', '')",
        ", 'SSH Key', ''); runShellScript('id')",
      );
      expect(
        shortcutsRemoteSsh
          .validate?.(substringBody, [{ path: "remote-id.cherri", contents: appendedBody }])
          .some((issue) => issue.severity === "error"),
      ).toBe(true);

      if (cherriAvailable()) {
        const source = join(root, "remote.cherri");
        await writeFile(source, cherri?.contents ?? "");
        const compiled = spawnSync(
          "cherri",
          [source, "--skip-sign", `-o=${join(root, "remote.shortcut")}`],
          { encoding: "utf8" },
        );
        expect(compiled.status).toBe(0);
      }

      expect(termuxShortcut.emit(remoteTextCommand)).toEqual([]);
      const [termux] = termuxShortcut.emit(remoteNoneCommand);
      expect(termux?.contents).toContain('MAC_EXEC="${POLYCAST_TERMUX_MAC_EXEC:-mac-exec}"');
      expect(termux?.contents).toContain("polycast-remote --command remote-none --protocol 1");
      expect(termux?.contents).not.toContain("host.example.test");

      const emitted = emitCommand(remoteTextCommand);
      expect(emitted.find((output) => output.target === "shortcuts-cherri")?.skipped).toBe(false);
      expect(emitted.find((output) => output.target === "shortcuts-remote-ssh")?.skipped).toBe(
        false,
      );
      expect(emitted.find((output) => output.target === "termux-shortcut")?.skipped).toBe(true);

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

  test("list and apply a remote build without loading a profile or key", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-remote-apply-"));
    const commands = join(root, "commands");
    const out = join(root, "build");
    const commandsStore = join(root, "commands-store");
    const oldProfiles = process.env.POLYCAST_REMOTE_PROFILES;
    const oldStore = process.env.POLYCAST_COMMANDS_DIR;
    try {
      await mkdir(commands, { recursive: true });
      await writeFile(
        join(commands, "remote-uppercase.ts"),
        commandDefToModule(remoteTextCommand, {
          defineImport: join(process.cwd(), "src/define.ts"),
        }),
      );
      await mkdir(join(out, "shortcuts-remote-ssh"), { recursive: true });
      await writeCommandsJson([remoteTextCommand], join(out, "commands"));
      await writeFile(
        join(out, "shortcuts-remote-ssh", "remote-uppercase.cherri"),
        "#include 'actions/network'\nrunSSHScript('polycast-remote --command remote-uppercase --protocol 1', ShortcutInput, 'host.example.test', '2222', 'operator', 'SSH Key', '')\n",
      );
      process.env.POLYCAST_REMOTE_PROFILES = join(root, "missing-profiles.json");
      process.env.POLYCAST_COMMANDS_DIR = commandsStore;

      expect((await polycastList(commands))[0]?.surfaces).toContain("shortcuts-remote-ssh");
      const result = await polycastApply({
        dir: commands,
        out,
        targets: ["shortcuts-remote-ssh"],
        write: true,
      });
      expect(result.results.some((item) => item.target === "commands-store")).toBe(true);
    } finally {
      if (oldProfiles === undefined) delete process.env.POLYCAST_REMOTE_PROFILES;
      else process.env.POLYCAST_REMOTE_PROFILES = oldProfiles;
      if (oldStore === undefined) delete process.env.POLYCAST_COMMANDS_DIR;
      else process.env.POLYCAST_COMMANDS_DIR = oldStore;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("revokes deleted remotely callable commands from reused build and host stores", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-remote-revoke-"));
    const out = join(root, "build");
    const store = join(root, "commands-store");
    const revoked = defineCommand({
      ...remoteNoneCommand,
      id: "remote-revoked",
      title: "Remote Revoked",
      body: { lang: "bash", source: "echo should-not-run" },
    });
    const oldStore = process.env.POLYCAST_COMMANDS_DIR;
    try {
      process.env.POLYCAST_COMMANDS_DIR = store;
      await mkdir(join(out, "shortcuts-remote-ssh"), { recursive: true });
      await writeCommandsJson([remoteTextCommand, revoked], join(out, "commands"));
      await applyBuilt({
        outRoot: out,
        write: true,
        targets: ["shortcuts-remote-ssh"],
      });
      await access(join(store, "remote-revoked.json"));

      await writeCommandsJson([remoteTextCommand], join(out, "commands"));
      await expect(access(join(out, "commands", "remote-revoked.json"))).rejects.toThrow();
      await applyBuilt({
        outRoot: out,
        write: true,
        targets: ["shortcuts-remote-ssh"],
      });
      await expect(access(join(store, "remote-revoked.json"))).rejects.toThrow();
      await expect(
        polycastRemote({
          commandsDir: store,
          originalCommand: "polycast-remote --command remote-revoked --protocol 1",
          input: new Uint8Array(),
        }),
      ).rejects.toThrow();
    } finally {
      if (oldStore === undefined) delete process.env.POLYCAST_COMMANDS_DIR;
      else process.env.POLYCAST_COMMANDS_DIR = oldStore;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("apply treats a compatibility-rejected Toolbox remote command as skipped", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-remote-toolbox-apply-"));
    const commands = join(root, "commands");
    const out = join(root, "build");
    const store = join(root, "commands-store");
    const mutation = defineCommand({
      ...remoteNoneCommand,
      id: "remote-toolbox-apply-mutate",
      targets: ["shortcuts-remote-ssh"],
      body: { lang: "exec", executable: "/usr/bin/false", args: ["deliver", "pr", "create"] },
      delegation: {
        kind: "toolbox",
        contract: "toolbox-polycast-adapter/v1",
        effectClass: "mutate",
        output: "canonical",
      },
    });
    const oldStore = process.env.POLYCAST_COMMANDS_DIR;
    try {
      await mkdir(commands, { recursive: true });
      await writeFile(
        join(commands, `${mutation.id}.ts`),
        commandDefToModule(mutation, { defineImport: join(process.cwd(), "src/define.ts") }),
      );
      process.env.POLYCAST_COMMANDS_DIR = store;

      const build = await polycastBuild({
        dir: commands,
        out,
        targets: ["shortcuts-remote-ssh"],
      });
      expect(build.files).not.toContain(`commands/${mutation.id}.json`);
      expect(build.skips).toEqual([
        {
          commandId: mutation.id,
          target: "shortcuts-remote-ssh",
          reason: 'effect class "mutate" requires a confirmation-capable local surface',
        },
      ]);
      await expect(
        polycastApply({
          dir: commands,
          out,
          targets: ["shortcuts-remote-ssh"],
          write: true,
        }),
      ).resolves.toMatchObject({ refused: 0 });
    } finally {
      if (oldStore === undefined) delete process.env.POLYCAST_COMMANDS_DIR;
      else process.env.POLYCAST_COMMANDS_DIR = oldStore;
      await rm(root, { recursive: true, force: true });
    }
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

  test("rejects sensitive Toolbox effects even when the stored command opts into remote", async () => {
    const commands = await mkdtemp(join(tmpdir(), "polycast-remote-toolbox-reject-"));
    const mutation = defineCommand({
      ...remoteNoneCommand,
      id: "remote-toolbox-mutate",
      body: { lang: "exec", executable: "/usr/bin/false", args: ["deliver", "pr", "create"] },
      delegation: {
        kind: "toolbox",
        contract: "toolbox-polycast-adapter/v1",
        effectClass: "mutate",
        output: "canonical",
      },
    });
    try {
      await writeCommandsJson([mutation], commands);
      await expect(
        polycastRemote({
          commandsDir: commands,
          originalCommand: "polycast-remote --command remote-toolbox-mutate --protocol 1",
          input: new Uint8Array(),
        }),
      ).rejects.toThrow("not remotely callable");
    } finally {
      await rm(commands, { recursive: true, force: true });
    }
  });
});
