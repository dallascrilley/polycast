import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

const PKG = join(import.meta.dir, "..", "extensions", "terminal-path-link.popclipext");
const CONFIG_PATH = join(PKG, "Config.json");
const GET_CWD = join(PKG, "get-terminal-cwd.sh");
const RESOLVE = join(PKG, "resolve-link.sh");
const REPO_ROOT = join(import.meta.dir, "..");

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

describe("resolve-link.sh", () => {
  test("resolves repo-relative path with cwd override", async () => {
    const target = "docs/agent-native/capability-map.md";
    const out =
      await $`TERMINAL_PATH_LINK_CWD=${REPO_ROOT} POPCLIP_TEXT=${target} ${RESOLVE}`.text();
    expect(out.trim()).toContain(`[${target}]`);
    expect(out).toContain("capability-map.md");
    expect(out).toContain("file://");
  });

  test("supports absolute existing paths", async () => {
    const out = await $`POPCLIP_TEXT=/etc/hosts ${RESOLVE}`.text();
    expect(out).toContain("file://");
    expect(out).toContain("/etc/hosts");
  });

  test("strips trailing :line from selection", async () => {
    const out =
      await $`TERMINAL_PATH_LINK_CWD=${REPO_ROOT} POPCLIP_TEXT=docs/agent-native/capability-map.md:42 ${RESOLVE}`.text();
    expect(out).toContain("[docs/agent-native/capability-map.md]");
    expect(out).not.toContain(":42]");
  });

  test("file_url option emits bare URL", async () => {
    const out =
      await $`TERMINAL_PATH_LINK_CWD=${REPO_ROOT} POPCLIP_TEXT=README.md POPCLIP_OPTION_LINK_FORMAT=file_url ${RESOLVE}`.text();
    expect(out.trim()).toMatch(/^file:\/\//);
    expect(out).not.toContain("[");
  });

  test("missing relative path exits non-zero", async () => {
    const proc = Bun.spawn(["bash", RESOLVE], {
      env: {
        ...process.env,
        TERMINAL_PATH_LINK_CWD: REPO_ROOT,
        POPCLIP_TEXT: "does/not/exist.md",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    expect(code).toBe(1);
  });
});
