import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

describe("script/polycast wrapper", () => {
  test("list subcommand exits 0", () => {
    const wrapper = join(process.cwd(), "script/polycast");
    const r = spawnSync(wrapper, ["list"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("uppercase");
  });

  test("runner list subcommand uses the separate runners directory", () => {
    const wrapper = join(process.cwd(), "script/polycast");
    const r = spawnSync(wrapper, ["runner", "list"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("polycast.worktree-review");
    expect(r.stdout).toContain("orca-plugin");
  });
});

describe("script/dogfood-level-a", () => {
  test("--help exits 0", () => {
    const script = join(process.cwd(), "script/dogfood-level-a");
    const r = spawnSync(script, ["--help"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("td-ff727f");
    expect(r.stdout).toContain("level-a-dogfood");
  });
});
