import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PKG = join(import.meta.dir, "..", "extensions", "terminal-path-link.popclipext");
const CONFIG_PATH = join(PKG, "Config.json");

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
