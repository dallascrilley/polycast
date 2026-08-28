import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import saveUrlToVault from "../commands/save-url-to-vault.ts";
import { writeCommandsJson } from "../src/commands-store.ts";
import { shortcutsCherri } from "../src/emitters/shortcuts-cherri.ts";

const cli = join(import.meta.dir, "..", "src", "cli.ts");

describe("save-url-to-vault command", () => {
  test("rejects non-web input before opening SSH", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-save-url-invalid-"));
    const commandsDir = join(root, "commands");
    const fakeBin = join(root, "bin");
    await mkdir(fakeBin);

    try {
      await writeCommandsJson([saveUrlToVault], commandsDir);
      const result = Bun.spawnSync(
        ["bun", "run", cli, "run", saveUrlToVault.id, "--commands", commandsDir, "--text", "notes"],
        {
          cwd: join(import.meta.dir, ".."),
          env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      expect(result.exitCode).toBe(64);
      expect(result.stderr.toString()).toContain("needs an http or https URL");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("sends the URL and conversion program to the Dallas SSH host", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-save-url-valid-"));
    const commandsDir = join(root, "commands");
    const fakeBin = join(root, "bin");
    const argvPath = join(root, "ssh-argv");
    const stdinPath = join(root, "ssh-stdin");
    const sshPath = join(fakeBin, "ssh");

    try {
      await mkdir(fakeBin);
      await writeCommandsJson([saveUrlToVault], commandsDir);
      await writeFile(
        sshPath,
        `#!/bin/bash\nprintf '%s\\n' "$@" > "$CAPTURE_ARGV"\ncat > "$CAPTURE_STDIN"\nprintf 'Saved /Users/dallascrilley/vault/inbox/auto/example.md\\n'\n`,
      );
      await chmod(sshPath, 0o755);

      const result = Bun.spawnSync(
        [
          "bun",
          "run",
          cli,
          "run",
          saveUrlToVault.id,
          "--commands",
          commandsDir,
          "--text",
          "  https://example.com/article?proof=*  ",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
            CAPTURE_ARGV: argvPath,
            CAPTURE_STDIN: stdinPath,
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("vault/inbox/auto/example.md");
      expect(await readFile(argvPath, "utf8")).toBe(
        [
          "-o",
          "Hostname=dallas-macbook.tail16923a.ts.net",
          "-o",
          "BatchMode=yes",
          "-o",
          "ConnectTimeout=10",
          "-o",
          "ServerAliveInterval=15",
          "-o",
          "ServerAliveCountMax=2",
          "dallas",
          "bash",
          "-s",
          "--",
          "aHR0cHM6Ly9leGFtcGxlLmNvbS9hcnRpY2xlP3Byb29mPSo=",
          "",
        ].join("\n"),
      );

      const remoteProgram = await readFile(stdinPath, "utf8");
      expect(remoteProgram).toContain('url="$(printf \'%s\' "$1" | base64 --decode)"');
      expect(remoteProgram).toContain('destination="$HOME/vault/inbox/auto"');
      expect(remoteProgram).toContain("curl \\");
      expect(remoteProgram).toContain("--max-filesize 10485760");
      expect(remoteProgram).toContain("pandoc --from=html --to=gfm-raw_html --wrap=none");
      expect(remoteProgram).toContain('while ! ln "$staging" "$path"');

      const cherri = shortcutsCherri
        .emit(saveUrlToVault)
        .find((file) => file.path === "save-url-to-vault.cherri");
      expect(cherri?.contents).toContain("#define from sharesheet");
      expect(cherri?.contents).toContain("#define inputs url, webpage, text");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("executes concurrent remote conversions without overwriting a note", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-save-url-remote-"));
    const commandsDir = join(root, "commands");
    const fakeBin = join(root, "bin");
    const remoteHome = join(root, "home");
    const fixtureHtml = join(root, "fixture.html");
    const sshPath = join(fakeBin, "ssh");
    const curlPath = join(fakeBin, "curl");
    const pandocPath = join(fakeBin, "pandoc");
    const url = "https://example.com/article?proof=*";

    try {
      await Promise.all([mkdir(fakeBin), mkdir(remoteHome)]);
      await writeCommandsJson([saveUrlToVault], commandsDir);
      await writeFile(
        fixtureHtml,
        "<html><head><title>Example Domain</title></head><body><h1>Example Domain</h1><p>Fixture body.</p></body></html>",
      );
      await writeFile(
        sshPath,
        [
          "#!/bin/bash",
          'last=""',
          'for arg in "$@"; do last="$arg"; done',
          'exec /bin/bash -s -- "$last"',
          "",
        ].join("\n"),
      );
      await writeFile(curlPath, '#!/bin/bash\ncat "$FIXTURE_HTML"\n');
      await writeFile(
        pandocPath,
        "#!/bin/bash\n/bin/sleep 0.2\nprintf '# Example Domain\\n\\nFixture body.\\n'\n",
      );
      await Promise.all([chmod(sshPath, 0o755), chmod(curlPath, 0o755), chmod(pandocPath, 0o755)]);

      const run = () =>
        Bun.spawn(
          ["bun", "run", cli, "run", saveUrlToVault.id, "--commands", commandsDir, "--text", url],
          {
            cwd: join(import.meta.dir, ".."),
            env: {
              ...process.env,
              PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
              HOME: remoteHome,
              FIXTURE_HTML: fixtureHtml,
            },
            stdout: "pipe",
            stderr: "pipe",
          },
        );

      const first = run();
      const second = run();
      const [firstExit, secondExit] = await Promise.all([first.exited, second.exited]);
      const [firstStderr, secondStderr] = await Promise.all([
        new Response(first.stderr).text(),
        new Response(second.stderr).text(),
      ]);
      expect([
        { exit: firstExit, stderr: firstStderr },
        { exit: secondExit, stderr: secondStderr },
      ]).toEqual([
        { exit: 0, stderr: "" },
        { exit: 0, stderr: "" },
      ]);

      const inbox = join(remoteHome, "vault", "inbox", "auto");
      const notes = (await readdir(inbox)).sort();
      expect(notes).toHaveLength(2);
      expect(notes[0]).not.toBe(notes[1]);
      for (const note of notes) {
        const contents = await readFile(join(inbox, note), "utf8");
        expect(contents).toContain(`Source: ${url}`);
        expect(contents).toContain("# Example Domain");
        expect(contents).toContain("Fixture body.");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
