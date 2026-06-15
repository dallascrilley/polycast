import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

const PKG = join(import.meta.dir, "..", "extensions", "terminal-path-link.popclipext");
const CONFIG_PATH = join(PKG, "Config.json");
const GET_CWD = join(PKG, "get-terminal-cwd.sh");

function loadConfig(): {
  actions: Array<{ regex?: string }>;
} {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

function actionRegex(): RegExp {
  const config = loadConfig();
  const regex = config.actions[0]?.regex;
  if (!regex) throw new Error("missing action regex");
  const stripped = regex.replace(/^\(\?i\)/, "");
  return new RegExp(stripped, "i");
}

describe("terminal-path-link.popclipext Config", () => {
  test("parses and has identifier", () => {
    const config = loadConfig();
    expect(config).toHaveProperty("identifier", "com.dallascrilley.terminal-path-link");
    expect(config.actions[0]?.regex).toBeTruthy();
  });

  test("regex accepts repo-relative paths", () => {
    const re = actionRegex();
    expect(re.test("docs/agent-native/capability-map.md")).toBe(true);
    expect(re.test("./src/emitters/popclip.ts")).toBe(true);
  });

  test("regex rejects arbitrary text", () => {
    const re = actionRegex();
    expect(re.test("hello world")).toBe(false);
    expect(re.test("no-extension")).toBe(false);
  });
});

describe("get-terminal-cwd.sh", () => {
  test("honors TERMINAL_PATH_LINK_CWD override", async () => {
    const out = await $`TERMINAL_PATH_LINK_CWD=/tmp/popclip-test ${GET_CWD}`.text();
    expect(out.trim()).toBe("/tmp/popclip-test");
  });

  test("rejects unsupported host bundle", async () => {
    const proc = Bun.spawn(["bash", GET_CWD], {
      env: {
        ...process.env,
        POPCLIP_BUNDLE_IDENTIFIER: "com.todesktop.230313mzl4w4u92",
        POPCLIP_APP_NAME: "Cursor",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(code).toBe(2);
    expect(stderr).toContain("iTerm2 or Terminal.app");
  });
});
