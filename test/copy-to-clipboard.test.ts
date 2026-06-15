import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import copyToClipboard from "../commands/copy-to-clipboard.ts";
import { writeCommandsJson } from "../src/commands-store.ts";
import { popclip } from "../src/emitters/popclip.ts";

describe("copy-to-clipboard sample", () => {
  test("emits popclip bundle with pbcopy body via dispatcher", () => {
    const files = popclip.emit(copyToClipboard);
    const config = files.find((f) => f.path.endsWith("Config.json"));
    const script = files.find((f) => f.path.endsWith("script.sh"));
    expect(config?.contents).toContain("com.polycast.copy-to-clipboard");
    expect(script?.contents).toContain("copy-to-clipboard");
    expect(script?.contents).toContain(" run --commands ");
  });

  test("polycast run copies text to pasteboard", async () => {
    if (process.platform !== "darwin") return;
    const commandsDir = await mkdtemp(join(tmpdir(), "polycast-copy-cmd-"));
    try {
      await writeCommandsJson([copyToClipboard], commandsDir);
      const run = spawnSync(
        "bun",
        [
          "run",
          "src/cli.ts",
          "run",
          "copy-to-clipboard",
          "--commands",
          commandsDir,
          "--text",
          "paste-me",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(run.status).toBe(0);

      const pasteboard = spawnSync("pbpaste", [], { encoding: "utf8" });
      expect(pasteboard.stdout).toBe("paste-me");
    } finally {
      await rm(commandsDir, { recursive: true, force: true });
    }
  });
});
