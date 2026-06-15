import { describe, expect, test } from "bun:test";
import { defineCommand } from "../src/define.ts";
import { popclip } from "../src/emitters/popclip.ts";
import { raycastScript } from "../src/emitters/raycast-script.ts";
import { emitCommand } from "../src/registry.ts";
import type { CommandDef } from "../src/types.ts";

const argsCmd: CommandDef = defineCommand({
  id: "open-repo",
  title: "Open Code Repo",
  description: "Open a subfolder of ~/Code in Finder.",
  icon: "📂",
  modality: "args",
  args: [{ name: "folder", placeholder: "repo name" }],
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

describe("raycast-script emitter", () => {
  test("emits a header + body for an args command", () => {
    const [file] = raycastScript.emit(argsCmd);
    expect(file?.path).toBe("open-repo.sh");
    expect(file?.mode).toBe(0o755);
    expect(file?.contents).toContain("# @raycast.schemaVersion 1");
    expect(file?.contents).toContain("# @raycast.title Open Code Repo");
    expect(file?.contents).toContain("# @raycast.mode silent");
    expect(file?.contents).toContain("# @raycast.packageName Navigation");
    expect(file?.contents).toContain('# @raycast.argument1 {"type":"text"');
    expect(file?.contents).toContain('open "$HOME/Code/$1"');
  });

  test("skips an incompatible (text) command", () => {
    expect(raycastScript.emit(textCmd)).toEqual([]);
  });
});

describe("popclip emitter", () => {
  test("emits a bundle for a text command", () => {
    const files = popclip.emit(textCmd);
    const config = files.find((f) => f.path.endsWith("Config.json"));
    const script = files.find((f) => f.path.endsWith("script.sh"));
    expect(config?.contents).toContain('"identifier": "com.polycast.uppercase"');
    expect(config?.contents).toContain('"shell script file": "script.sh"');
    expect(script?.mode).toBe(0o755);
    // The modality wrapper pipes the selection into the body's stdin contract.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting literal bash output, not a JS template.
    expect(script?.contents).toContain('printf %s "${POPCLIP_TEXT-}" | {');
    expect(script?.contents).toContain("tr '[:lower:]' '[:upper:]'");
  });

  test("skips an incompatible (args) command", () => {
    expect(popclip.emit(argsCmd)).toEqual([]);
  });
});

describe("registry.emitCommand", () => {
  test("routes each command to compatible surfaces and marks skips", () => {
    const results = emitCommand(argsCmd);
    const raycast = results.find((r) => r.target === "raycast-script");
    const pop = results.find((r) => r.target === "popclip");
    expect(raycast?.skipped).toBe(false);
    expect(pop?.skipped).toBe(true);
  });

  test("throws on an unknown target", () => {
    expect(() => emitCommand(argsCmd, ["does-not-exist"])).toThrow(/unknown target/);
  });
});
