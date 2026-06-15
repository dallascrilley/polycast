import { describe, expect, test } from "bun:test";
import { defineCommand } from "../src/define.ts";
import { shortcutsArgsShim, shortcutsNoneShim, shortcutsTextShim } from "../src/shim.ts";

const textCmd = defineCommand({
  id: "uppercase",
  title: "Uppercase",
  description: "upper",
  modality: "text",
  body: { lang: "bash", source: "tr '[:lower:]' '[:upper:]'" },
});

const argsCmd = defineCommand({
  id: "open-repo",
  title: "Open Code Repo",
  description: "open",
  modality: "args",
  args: [{ name: "folder", placeholder: "repo name" }],
  body: { lang: "bash", source: 'open "$HOME/Code/$1"' },
});

const noneCmd = defineCommand({
  id: "ping",
  title: "Ping",
  description: "ping",
  modality: "none",
  body: { lang: "bash", source: "echo ok" },
});

describe("shortcuts cherri shims", () => {
  test("text shim delegates to polycast run with --text", () => {
    const shim = shortcutsTextShim(textCmd);
    expect(shim).toContain("uppercase");
    expect(shim).toContain('run --commands "$COMMANDS" uppercase --text');
    expect(shim).not.toContain("tr '[:lower:]'");
  });

  test("args shim delegates with positional set --", () => {
    const shim = shortcutsArgsShim(argsCmd);
    expect(shim).toContain('run --commands "$COMMANDS" open-repo "$@"');
    expect(shim).toContain('set -- "{@polycast_arg_1}"');
    expect(shim).not.toContain('open "$HOME/Code/$1"');
  });

  test("none shim delegates without extra args", () => {
    const shim = shortcutsNoneShim(noneCmd);
    expect(shim).toContain('run --commands "$COMMANDS" ping');
  });
});
