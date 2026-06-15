import { describe, expect, test } from "bun:test";
import { applyBuilt, installDirForTarget, pruneOwned } from "../src/apply.ts";
import { OWNERSHIP_MARKER } from "../src/constants.ts";
import { defineCommand } from "../src/define.ts";
import { agentCli } from "../src/emitters/agent-cli.ts";
import { dropoverScript } from "../src/emitters/dropover-script.ts";
import { dropzone } from "../src/emitters/dropzone.ts";
import { popclip } from "../src/emitters/popclip.ts";
import { raycastQuicklink } from "../src/emitters/raycast-quicklink.ts";
import { raycastScript } from "../src/emitters/raycast-script.ts";
import { raycastSnippet } from "../src/emitters/raycast-snippet.ts";
import { shortcutsCherri } from "../src/emitters/shortcuts-cherri.ts";
import { emitCatalogs, emitCommand, emitters } from "../src/registry.ts";
import type { CommandDef } from "../src/types.ts";

const argsCmd: CommandDef = defineCommand({
  id: "open-repo",
  title: "Open Code Repo",
  description: "Open a subfolder of ~/Code in Finder.",
  icon: "📂",
  modality: "args",
  args: [{ name: "folder", placeholder: "repo name", type: "text" }],
  x: { raycast: { mode: "silent", packageName: "Navigation" } },
  body: { lang: "bash", source: 'open "$HOME/Code/$1"' },
});

const textCmd: CommandDef = defineCommand({
  id: "uppercase",
  title: "Uppercase",
  description: "Convert the selected text to UPPERCASE.",
  icon: "🔠",
  modality: "text",
  body: { lang: "bash", source: "tr '[:lower:]' '[:upper:]'" },
});

const filesCmd: CommandDef = defineCommand({
  id: "basename-files",
  title: "Basename Files",
  description: "Print basenames.",
  modality: "files",
  body: { lang: "bash", source: 'for f in "$@"; do basename "$f"; done' },
});

describe("raycast-script emitter", () => {
  test("emits a header + body for an args command", () => {
    const [file] = raycastScript.emit(argsCmd);
    expect(file?.path).toBe("open-repo.sh");
    expect(file?.contents).toContain("# @raycast.schemaVersion 1");
    expect(file?.contents).toContain("# @raycast.mode silent");
    expect(file?.contents).toContain('"type":"text"');
  });

  test("skips text commands", () => {
    expect(raycastScript.emit(textCmd)).toEqual([]);
  });

  test("validate catches missing metadata", () => {
    const bad = [{ path: "x.sh", contents: "#!/bin/bash\n" }];
    const issues = raycastScript.validate?.(argsCmd, bad) ?? [];
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });
});

describe("popclip emitter", () => {
  test("emits bundle with stdin:text", () => {
    const files = popclip.emit(textCmd);
    const config = files.find((f) => f.path.endsWith("Config.json"));
    expect(config?.contents).toContain('"stdin": "text"');
    expect(config?.contents).toContain('"popclip version": 4050');
  });

  test("skips args commands", () => {
    expect(popclip.emit(argsCmd)).toEqual([]);
  });
});

describe("dropzone emitter", () => {
  test("emits dzbundle for files", () => {
    const files = dropzone.emit(filesCmd);
    expect(files.some((f) => f.path.endsWith("action.rb"))).toBe(true);
    expect(files.some((f) => f.path.endsWith("run.sh"))).toBe(true);
    const action = files.find((f) => f.path.endsWith("action.rb"));
    expect(action?.contents).toContain("# Name: Basename Files");
    expect(action?.contents).toContain("# Handles: Files");
  });
});

describe("dropover-script emitter", () => {
  test("emits shell script and catalog manifest", () => {
    const files = dropoverScript.emit(filesCmd);
    expect(files[0]?.path).toBe("basename-files.sh");
    const catalog = dropoverScript.emitCatalog?.([filesCmd]) ?? [];
    expect(catalog[0]?.path).toBe("manifest.json");
    expect(catalog[0]?.contents).toContain("basename-files");
  });
});

describe("dropover import note", () => {
  test("formats operator checklist from manifest", async () => {
    const { formatDropoverImportNote, parseDropoverManifest } = await import(
      "../src/dropover-manifest.ts"
    );
    const raw = dropoverScript.emitCatalog?.([filesCmd])?.[0]?.contents ?? "";
    const note = formatDropoverImportNote("/tmp/staging", parseDropoverManifest(raw));
    expect(note).toContain("/tmp/staging/basename-files.sh");
    expect(note).toContain("Custom Scripts");
    expect(note).toContain("never edits Dropover prefs");
  });
});

describe("shortcuts-cherri emitter", () => {
  test("emits cherri with runShellScript", () => {
    const [file] = shortcutsCherri.emit(textCmd);
    expect(file?.path).toBe("uppercase.cherri");
    expect(file?.contents).toContain("runShellScript");
    expect(file?.contents).toContain("#define inputs text");
  });

  test("emits args commands with prompt and positional setup", () => {
    const files = shortcutsCherri.emit(argsCmd);
    const cherri = files.find((f) => f.path.endsWith(".cherri"));
    expect(cherri?.contents).toContain('@polycast_arg_1 = prompt("repo name"');
    expect(cherri?.contents).toContain('set -- "{@polycast_arg_1}"');
    expect(cherri?.contents).toContain('open "$HOME/Code/$1"');
  });

  test("skips args commands with dropdown fields", () => {
    const cmd = defineCommand({
      id: "pick",
      title: "Pick",
      description: "pick",
      modality: "args",
      args: [{ name: "choice", type: "dropdown", data: [{ title: "A", value: "a" }] }],
      body: { lang: "bash", source: "echo $1" },
    });
    expect(shortcutsCherri.emit(cmd)).toEqual([]);
  });

  test("skips files commands", () => {
    expect(shortcutsCherri.emit(filesCmd)).toEqual([]);
  });
});

describe("raycast catalog emitters", () => {
  test("aggregates snippets", () => {
    const cmd = defineCommand({
      id: "mkcd",
      title: "mkcd",
      description: "mkcd",
      modality: "none",
      body: { lang: "bash", source: "true" },
      x: { raycast: { snippet: { text: "mkcd ", keyword: "mkcd" } } },
    });
    const [file] = raycastSnippet.emitCatalog?.([cmd]) ?? [];
    expect(file?.contents).toContain('"keyword": "mkcd"');
  });

  test("aggregates quicklinks", () => {
    const cmd = defineCommand({
      id: "open-code",
      title: "Open Code",
      description: "open",
      modality: "args",
      args: [{ name: "folder", placeholder: "folder-name" }],
      body: { lang: "bash", source: "true" },
      x: { raycast: { quicklink: { link: "~/Code/{folder}", openWith: "Finder" } } },
    });
    const [file] = raycastQuicklink.emitCatalog?.([cmd]) ?? [];
    expect(file?.contents).toContain("argument name");
  });
});

describe("agent-cli emitter", () => {
  test("emits dispatcher stub and meta sidecar", () => {
    const files = agentCli.emit(textCmd);
    const bin = files.find((f) => f.path === "uppercase");
    expect(bin?.contents).toContain(" run --commands ");
    expect(bin?.contents).toContain("uppercase");
    expect(files.some((f) => f.path === "uppercase.polycast-meta.json")).toBe(true);
  });
});

describe("registry", () => {
  test("has eight emitters", () => {
    expect(emitters.length).toBe(8);
  });

  test("emitCommand marks skips", () => {
    const results = emitCommand(argsCmd);
    expect(results.find((r) => r.target === "raycast-script")?.skipped).toBe(false);
    expect(results.find((r) => r.target === "shortcuts-cherri")?.skipped).toBe(false);
    expect(results.find((r) => r.target === "popclip")?.skipped).toBe(true);
  });

  test("throws on unknown target", () => {
    expect(() => emitCommand(argsCmd, ["nope"])).toThrow(/unknown target/);
  });
});

describe("apply dry-run", () => {
  test("returns install actions after build", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const out = await mkdtemp(join(tmpdir(), "polycast-apply-"));
    const prevSkip = process.env.POLYCAST_SKIP_CHERRI;
    process.env.POLYCAST_SKIP_CHERRI = "1";
    try {
      const { spawnSync } = await import("node:child_process");
      const build = spawnSync("bun", ["run", "src/cli.ts", "build", "--out", out, "--strict"], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(build.status).toBe(0);

      const results = await applyBuilt({
        outRoot: out,
        write: false,
        targets: ["agent-cli"],
      });
      expect(results.some((r) => r.action === "would install")).toBe(true);
    } finally {
      if (prevSkip === undefined) delete process.env.POLYCAST_SKIP_CHERRI;
      else process.env.POLYCAST_SKIP_CHERRI = prevSkip;
      await rm(out, { recursive: true, force: true });
    }
  });

  test("refuses overwrite of unowned install paths", async () => {
    const { mkdtemp, rm, writeFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const out = await mkdtemp(join(tmpdir(), "polycast-apply-"));
    const installRoot = await mkdtemp(join(tmpdir(), "polycast-install-"));
    const prevAgent = process.env.POLYCAST_AGENT_BIN;
    process.env.POLYCAST_AGENT_BIN = installRoot;
    process.env.POLYCAST_SKIP_CHERRI = "1";
    try {
      const { spawnSync } = await import("node:child_process");
      expect(
        spawnSync("bun", ["run", "src/cli.ts", "build", "--out", out, "--strict"], {
          cwd: process.cwd(),
          encoding: "utf8",
        }).status,
      ).toBe(0);

      await mkdir(installRoot, { recursive: true });
      await writeFile(join(installRoot, "uppercase"), "#!/bin/bash\necho foreign\n", "utf8");

      const results = await applyBuilt({
        outRoot: out,
        write: true,
        targets: ["agent-cli"],
      });
      const upper = results.find((r) => r.path.endsWith("/uppercase"));
      expect(upper?.action).toBe("refused");
      expect(results.some((r) => r.path.endsWith("/uppercase.polycast-owned"))).toBe(false);
    } finally {
      if (prevAgent === undefined) delete process.env.POLYCAST_AGENT_BIN;
      else process.env.POLYCAST_AGENT_BIN = prevAgent;
      await rm(out, { recursive: true, force: true });
      await rm(installRoot, { recursive: true, force: true });
    }
  });
});

describe("pruneOwned", () => {
  test("removes owned agent-cli artifacts and leaves foreign files", async () => {
    const { mkdtemp, rm, writeFile, readFile, access } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const installRoot = await mkdtemp(join(tmpdir(), "polycast-prune-"));
    const prevAgent = process.env.POLYCAST_AGENT_BIN;
    process.env.POLYCAST_AGENT_BIN = installRoot;
    try {
      await writeFile(join(installRoot, "uppercase"), "#!/bin/sh\n");
      await writeFile(join(installRoot, "uppercase.polycast-owned"), "polycast\n");
      await writeFile(join(installRoot, "foreign-tool"), "keep\n");

      const root = installDirForTarget("agent-cli");
      expect(root).toBe(installRoot);

      const removed = await pruneOwned(root!, true);
      expect(removed.some((p) => p.endsWith("uppercase.polycast-owned"))).toBe(true);

      await expect(access(join(installRoot, "uppercase.polycast-owned"))).rejects.toThrow();
      await readFile(join(installRoot, "foreign-tool"), "utf8");
    } finally {
      if (prevAgent === undefined) delete process.env.POLYCAST_AGENT_BIN;
      else process.env.POLYCAST_AGENT_BIN = prevAgent;
      await rm(installRoot, { recursive: true, force: true });
    }
  });

  test("removes owned bundle directories", async () => {
    const { mkdtemp, rm, writeFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const installRoot = await mkdtemp(join(tmpdir(), "polycast-prune-pop-"));
    const bundle = join(installRoot, "Uppercase.popclipext");
    try {
      await mkdir(bundle, { recursive: true });
      await writeFile(join(bundle, OWNERSHIP_MARKER), "polycast\n");
      await writeFile(join(bundle, "Config.plist"), "{}");

      const removed = await pruneOwned(installRoot, true);
      expect(removed).toContain(bundle);
    } finally {
      await rm(installRoot, { recursive: true, force: true });
    }
  });
});
