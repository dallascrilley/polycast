import { describe, expect, test } from "bun:test";
import { applyBuilt } from "../src/apply.ts";
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

describe("shortcuts-cherri emitter", () => {
  test("emits cherri with runShellScript", () => {
    const [file] = shortcutsCherri.emit(textCmd);
    expect(file?.path).toBe("uppercase.cherri");
    expect(file?.contents).toContain("runShellScript");
    expect(file?.contents).toContain("#define inputs text");
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
  test("emits executable and meta sidecar", () => {
    const files = agentCli.emit(textCmd);
    expect(files.some((f) => f.path === "uppercase")).toBe(true);
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
    expect(results.find((r) => r.target === "popclip")?.skipped).toBe(true);
  });

  test("throws on unknown target", () => {
    expect(() => emitCommand(argsCmd, ["nope"])).toThrow(/unknown target/);
  });
});

describe("apply dry-run", () => {
  test("returns actions without writing", async () => {
    const results = await applyBuilt({
      outRoot: "build",
      write: false,
      targets: ["agent-cli"],
    });
    expect(results.length).toBeGreaterThan(0);
  });
});
