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
});
