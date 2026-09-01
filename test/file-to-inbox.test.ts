import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fileToInboxCommand from "../commands/file-to-inbox.ts";
import { writeCommandsJson } from "../src/commands-store.ts";
import { dropoverScript } from "../src/emitters/dropover-script.ts";
import { dropzone } from "../src/emitters/dropzone.ts";
import { popclip } from "../src/emitters/popclip.ts";
import { raycastQuicklink } from "../src/emitters/raycast-quicklink.ts";
import { raycastScript } from "../src/emitters/raycast-script.ts";
import { raycastSnippet } from "../src/emitters/raycast-snippet.ts";
import { shortcutsCherri } from "../src/emitters/shortcuts-cherri.ts";
import {
  EX_NOINPUT,
  EX_USAGE,
  FILE_TO_INBOX_RECEIPT_DIR,
  fileToInbox,
  parseFileToInboxArgs,
  readFinderTagPlist,
  runFileToInbox,
} from "../src/file-to-inbox.ts";
import { emitCommand } from "../src/registry.ts";
import { shortcutsFilesShim } from "../src/shim.ts";

const cli = join(import.meta.dir, "..", "src", "cli.ts");

async function scratch(): Promise<{ root: string; inbox: string; sources: string }> {
  const root = await mkdtemp(join(tmpdir(), "polycast-file-to-inbox-"));
  const inbox = join(root, "Inbox");
  const sources = join(root, "sources");
  await mkdir(sources);
  return { root, inbox, sources };
}

async function writeSource(dir: string, name: string, contents: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, contents);
  return path;
}

describe("file-to-inbox capability", () => {
  test("copies with Review tag, unique names, and a receipt", async () => {
    const { root, inbox, sources } = await scratch();
    try {
      const first = await writeSource(sources, "notes.txt", "alpha");
      await mkdir(inbox);
      await writeSource(inbox, "notes.txt", "already here");
      const receipt = await fileToInbox({
        sources: [first],
        inbox,
        tag: "Review",
        dryRun: false,
      });

      expect(receipt.schemaVersion).toBe(1);
      expect(receipt.dryRun).toBe(false);
      expect(receipt.entries).toHaveLength(1);
      expect(receipt.entries[0]?.destination).toBe(join(inbox, "notes-2.txt"));
      expect(receipt.entries[0]?.copied).toBe(true);
      expect(receipt.entries[0]?.sha256).toHaveLength(64);
      expect(await readFile(first, "utf8")).toBe("alpha");
      expect(await readFile(join(inbox, "notes.txt"), "utf8")).toBe("already here");
      expect(await readFile(join(inbox, "notes-2.txt"), "utf8")).toBe("alpha");
      await writeSource(sources, ".env", "secret=1");
      await writeSource(inbox, ".env", "existing");
      const dot = await fileToInbox({
        sources: [join(sources, ".env")],
        inbox,
        tag: "Review",
        dryRun: false,
      });
      expect(dot.entries[0]?.destination).toBe(join(inbox, ".env-2"));
      expect(await readFile(join(inbox, ".env-2"), "utf8")).toBe("secret=1");
      if (process.platform === "darwin") {
        expect(readFinderTagPlist(join(inbox, "notes-2.txt"))).toContain("Review");
      }
      expect(receipt.receiptPath).toBeTruthy();
      const stored = JSON.parse(await readFile(receipt.receiptPath ?? "", "utf8"));
      expect(stored.entries[0].sha256).toBe(receipt.entries[0]?.sha256);
      expect(stored.entries[0].destination).toBe(receipt.entries[0]?.destination);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps paths with spaces and quotes as argv, not newline text", async () => {
    const { root, inbox, sources } = await scratch();
    try {
      const spaced = await writeSource(sources, "my notes.txt", "spaced");
      const quoted = await writeSource(sources, 'quote"here.txt', "quoted");
      const receipt = await fileToInbox({
        sources: [spaced, quoted],
        inbox,
        tag: "Review",
        dryRun: false,
      });
      expect(receipt.entries.map((e) => e.destination).sort()).toEqual(
        [join(inbox, "my notes.txt"), join(inbox, 'quote"here.txt')].sort(),
      );
      expect(await readFile(join(inbox, "my notes.txt"), "utf8")).toBe("spaced");
      expect(await readFile(join(inbox, 'quote"here.txt'), "utf8")).toBe("quoted");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("dry-run prints a receipt and writes nothing", async () => {
    const { root, inbox, sources } = await scratch();
    try {
      const src = await writeSource(sources, "keep.txt", "payload");
      const receipt = await fileToInbox({
        sources: [src],
        inbox,
        tag: "Review",
        dryRun: true,
      });
      expect(receipt.dryRun).toBe(true);
      expect(receipt.receiptPath).toBeNull();
      expect(receipt.entries[0]?.copied).toBe(false);
      expect(receipt.entries[0]?.destination).toBe(join(inbox, "keep.txt"));
      await expect(readdir(inbox)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("concurrent copies of the same name do not overwrite", async () => {
    const { root, inbox, sources } = await scratch();
    try {
      const a = await writeSource(sources, "same.txt", "one");
      await mkdir(join(sources, "other"));
      const b = await writeSource(join(sources, "other"), "same.txt", "two");

      const [first, second] = await Promise.all([
        fileToInbox({ sources: [a], inbox, tag: "Review", dryRun: false }),
        fileToInbox({ sources: [b], inbox, tag: "Review", dryRun: false }),
      ]);
      const dests = [first.entries[0]?.destination, second.entries[0]?.destination];
      expect(new Set(dests).size).toBe(2);
      const bodies = (await readdir(inbox))
        .filter((name) => name !== FILE_TO_INBOX_RECEIPT_DIR)
        .sort();
      expect(bodies).toHaveLength(2);
      const contents = (
        await Promise.all(bodies.map((name) => readFile(join(inbox, name), "utf8")))
      ).sort();
      expect(contents).toEqual(["one", "two"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects missing files and empty argv", async () => {
    const { root, inbox } = await scratch();
    try {
      await expect(
        fileToInbox({ sources: [], inbox, tag: "Review", dryRun: true }),
      ).rejects.toMatchObject({ code: EX_USAGE });
      await expect(
        fileToInbox({
          sources: [join(root, "missing.txt")],
          inbox,
          tag: "Review",
          dryRun: true,
        }),
      ).rejects.toMatchObject({ code: EX_NOINPUT });
      expect("error" in parseFileToInboxArgs(["--nope"])).toBe(true);
      expect(await runFileToInbox([])).toBe(EX_USAGE);
      const commandsDir = join(root, "commands");
      await writeCommandsJson([fileToInboxCommand], commandsDir);
      const help = Bun.spawnSync(
        ["bun", "run", cli, "run", fileToInboxCommand.id, "--commands", commandsDir, "--help"],
        { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" },
      );
      expect(help.exitCode).toBe(0);
      expect(help.stdout.toString()).toContain("--inbox");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("polycast run exec body uses scratch inbox only", async () => {
    const { root, inbox, sources } = await scratch();
    const commandsDir = join(root, "commands");
    try {
      const src = await writeSource(sources, "via-run.txt", "from polycast run");
      const spaced = await writeSource(sources, "my notes.txt", "spaced argv");
      await writeCommandsJson([fileToInboxCommand], commandsDir);
      const result = Bun.spawnSync(
        [
          "bun",
          "run",
          cli,
          "run",
          fileToInboxCommand.id,
          "--commands",
          commandsDir,
          "--",
          "--inbox",
          inbox,
          src,
          spaced,
        ],
        {
          cwd: join(import.meta.dir, ".."),
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      expect(result.exitCode).toBe(0);
      const receipt = JSON.parse(result.stdout.toString());
      expect(receipt.entries.map((e: { destination: string }) => e.destination).sort()).toEqual(
        [join(inbox, "via-run.txt"), join(inbox, "my notes.txt")].sort(),
      );
      expect(await readFile(join(inbox, "via-run.txt"), "utf8")).toBe("from polycast run");
      expect(await readFile(join(inbox, "my notes.txt"), "utf8")).toBe("spaced argv");
      expect(result.stderr.toString()).toBe("");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("file-to-inbox adapters", () => {
  test("emits files argv on Dropover, Dropzone, agent-cli, and Shortcuts", () => {
    const outputs = emitCommand(fileToInboxCommand);
    const byTarget = Object.fromEntries(outputs.map((o) => [o.target, o]));

    expect(byTarget["dropover-script"]?.skipped).toBe(false);
    expect(byTarget.dropzone?.skipped).toBe(false);
    expect(byTarget["agent-cli"]?.skipped).toBe(false);
    expect(byTarget["shortcuts-cherri"]?.skipped).toBe(false);

    const cherri = shortcutsCherri
      .emit(fileToInboxCommand)
      .find((file) => file.path === "file-to-inbox.cherri");
    expect(cherri?.contents).toContain("#define inputs file");
    expect(cherri?.contents).toContain("#define from sharesheet");
    expect(cherri?.contents).toContain("'as arguments'");
    expect(cherri?.contents).not.toContain(" --text ");
    expect(cherri?.contents).toContain('run --commands "$COMMANDS" file-to-inbox "$@"');
    expect(cherri?.contents).not.toContain("file-to-inbox.ts");

    expect(dropzone.emit(fileToInboxCommand).some((f) => f.path.endsWith("run.sh"))).toBe(true);
    expect(dropoverScript.emit(fileToInboxCommand)[0]?.contents).toContain(
      'run --commands "$COMMANDS" file-to-inbox "$@"',
    );
    expect(shortcutsFilesShim(fileToInboxCommand)).toContain('"$@"');
    expect(fileToInboxCommand.body.lang).toBe("exec");
  });

  test("skips launchers that cannot represent files", () => {
    expect(popclip.emit(fileToInboxCommand)).toEqual([]);
    expect(raycastScript.emit(fileToInboxCommand)).toEqual([]);
    expect(raycastSnippet.emit(fileToInboxCommand)).toEqual([]);
    expect(raycastQuicklink.emit(fileToInboxCommand)).toEqual([]);
    expect(
      emitCommand(fileToInboxCommand)
        .filter((o) => o.skipped)
        .map((o) => o.target),
    ).toEqual(
      expect.arrayContaining(["popclip", "raycast-script", "raycast-snippet", "raycast-quicklink"]),
    );
  });
});
