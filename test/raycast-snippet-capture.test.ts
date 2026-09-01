import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  captureRaycastSnippets,
  discoverLatestRaycastSnippetExport,
} from "../src/importers/raycast-snippets.ts";
import { loadCommands } from "../src/load.ts";
import { polycastBuild } from "../src/polycast-api.ts";

function fixture(): readonly unknown[] {
  return [
    {
      name: " Deploy checklist ",
      text: "Run tests, inspect the diff, then deploy.",
      keyword: ";deploy",
      tags: ["workflow"],
      futureField: "reported, not copied",
    },
    {
      name: "Code braces",
      text: 'function ready() { return "yes"; }',
    },
    {
      name: "Service credential",
      text: "github_pat_1234567890abcdefghijklmnop",
    },
    {
      name: "Personal contact",
      text: "dallas@private-domain.test",
    },
    {
      name: "Clipboard paste",
      text: "Use {clipboard} here",
    },
    {
      name: "Local project",
      text: "Inspect /Users/ before continuing.",
    },
    {
      name: "Oversized",
      text: "x".repeat(8193),
    },
    {
      name: "Missing text",
    },
    {
      name: "First collision",
      text: "first",
      keyword: ";same",
    },
    {
      name: "Second collision",
      text: "second",
      keyword: ";same",
    },
    {
      name: "Blank keyword",
      text: "blank",
      keyword: "",
    },
    {
      name: "Control byte",
      text: "bad\u0000value",
    },
    {
      name: "Office address",
      text: "6960 Sumner St",
    },
    {
      name: "Tailscale host",
      text: "studio.tailnet-name.ts.net",
    },
    {
      name: "Discard work",
      text: "git reset --hard HEAD~1",
    },
    {
      name: "Copy private key",
      text: "pbcopy < ~/.ssh/id_rsa",
    },
    {
      name: "Environment API key",
      text: "export API_KEY=$API_KEY",
    },
    {
      name: "1Password helper",
      text: "Sign in to 1Password before continuing.",
    },
    {
      name: "CLI setup-token",
      text: "tool setup-token",
    },
    {
      name: "Example email is documentation",
      text: "Use person@example.com in fixtures.",
      keyword: ";example-email",
    },
  ];
}

async function writeFixture(root: string): Promise<string> {
  const input = join(root, "Snippets export.json");
  await writeFile(input, `${JSON.stringify(fixture(), null, 2)}\n`);
  return input;
}

describe("Raycast snippet capture", () => {
  test("classifies unsafe and lossy entries without exposing them in output", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-raycast-capture-"));
    try {
      const input = await writeFixture(root);
      const outputDir = join(root, "commands", "raycast-snippets");
      const plan = await captureRaycastSnippets({ input, outputDir });

      expect(plan.sourceEntries).toBe(20);
      expect(plan.accepted).toBe(3);
      expect(plan.rejected).toBe(17);
      expect(plan.rejectionCounts["credential-like"]).toBe(5);
      expect(plan.rejectionCounts["personal-data"]).toBe(2);
      expect(plan.rejectionCounts["dynamic-placeholder"]).toBe(1);
      expect(plan.rejectionCounts["machine-specific"]).toBe(2);
      expect(plan.rejectionCounts["unsafe-operation"]).toBe(1);
      expect(plan.rejectionCounts.oversized).toBe(1);
      expect(plan.rejectionCounts["invalid-entry"]).toBe(1);
      expect(plan.rejectionCounts["keyword-collision"]).toBe(2);
      expect(plan.rejectionCounts["blank-keyword"]).toBe(1);
      expect(plan.rejectionCounts["control-character"]).toBe(1);
      expect(plan.lossCounts["name-trimmed"]).toBe(1);
      expect(plan.lossCounts["tags-omitted"]).toBe(1);
      expect(plan.lossCounts["unknown-fields-omitted"]).toBe(1);
      expect(plan.create).toBe(3);
      expect(plan.reportChanged).toBe(true);
      await expect(readdir(outputDir)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("write preserves the export and reruns byte-identically", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-raycast-capture-write-"));
    try {
      const input = await writeFixture(root);
      const outputDir = join(root, "commands", "raycast-snippets");
      const beforeBytes = await readFile(input);
      const beforeStat = await stat(input);

      const written = await captureRaycastSnippets({ input, outputDir, write: true });
      expect(written.written).toBe(true);
      expect(written.create).toBe(3);
      const entries = await readdir(outputDir);
      expect(entries.filter((entry) => entry.endsWith(".ts"))).toHaveLength(3);
      expect(entries).toContain("capture-report.json");

      const commands = await loadCommands(outputDir);
      expect(commands).toHaveLength(3);
      expect(commands.every((command) => command.x?.raycast?.snippet?.text)).toBe(true);
      expect(commands.find((command) => command.title === "Code braces")?.body.lang).toBe("node");

      const buildRoot = join(root, "build");
      await polycastBuild({
        dir: join(root, "commands"),
        out: buildRoot,
        targets: ["raycast-snippet"],
        strict: true,
      });
      const catalog: unknown = JSON.parse(
        await readFile(join(buildRoot, "raycast-snippet", "snippets.json"), "utf8"),
      );
      expect(Array.isArray(catalog)).toBe(true);
      expect(catalog).toHaveLength(3);

      expect(await readFile(input)).toEqual(beforeBytes);
      const afterStat = await stat(input);
      expect(afterStat.size).toBe(beforeStat.size);
      expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
      expect(afterStat.mode).toBe(beforeStat.mode);

      const second = await captureRaycastSnippets({ input, outputDir, write: true });
      expect(second.create).toBe(0);
      expect(second.update).toBe(0);
      expect(second.remove).toBe(0);
      expect(second.unchanged).toBe(3);
      expect(second.reportChanged).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses to mix generated output with a foreign file", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-raycast-capture-foreign-"));
    try {
      const input = await writeFixture(root);
      const outputDir = join(root, "commands", "raycast-snippets");
      await mkdir(outputDir, { recursive: true });
      const foreign = join(outputDir, "hand-authored.ts");
      await writeFile(foreign, "export default {};\n");

      await expect(captureRaycastSnippets({ input, outputDir, write: true })).rejects.toEqual(
        expect.objectContaining({ code: "FOREIGN_OUTPUT" }),
      );
      expect(await readFile(foreign, "utf8")).toBe("export default {};\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("discovers the newest bounded JSON export", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-raycast-discovery-"));
    try {
      const older = join(root, "Snippets older.json");
      const newer = join(root, "Snippets newer.json");
      await writeFile(older, "[]\n");
      await writeFile(newer, "[]\n");
      await utimes(older, new Date(1_700_000_000_000), new Date(1_700_000_000_000));
      await utimes(newer, new Date(1_800_000_000_000), new Date(1_800_000_000_000));

      expect(await discoverLatestRaycastSnippetExport([root])).toBe(newer);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("CLI is dry-run-first", async () => {
    const root = await mkdtemp(join(tmpdir(), "polycast-raycast-capture-cli-"));
    try {
      const input = await writeFixture(root);
      const outputDir = join(root, "output");
      const result = Bun.spawnSync([
        "bun",
        "run",
        "src/cli.ts",
        "capture",
        "--from",
        "raycast-snippets",
        "--input",
        input,
        "--dir",
        outputDir,
      ]);
      expect(result.exitCode).toBe(0);
      const stdout = result.stdout.toString();
      expect(stdout).toContain("Dry run.");
      expect(stdout).toContain("accepted    3");
      expect(stdout).not.toContain("github_pat_");
      await expect(readdir(outputDir)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
