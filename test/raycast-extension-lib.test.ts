import { describe, expect, test } from "bun:test";
import { parseWorktreeOptions } from "../raycast-extension/src/lib/orca.ts";
import { buildArgv, parseStoredCommand } from "../raycast-extension/src/lib/store.ts";

describe("Raycast extension store helpers", () => {
  test("ignore malformed command documents", () => {
    expect(parseStoredCommand("not json")).toBeNull();
    expect(parseStoredCommand(JSON.stringify({ title: "Missing id" }))).toBeNull();
    expect(
      parseStoredCommand(
        JSON.stringify({
          id: "bad-modality",
          title: "Bad modality",
          description: "invalid",
          modality: "unknown",
        }),
      ),
    ).toBeNull();
  });

  test("parse a real-shaped rename-orca-tabs document", () => {
    const command = parseStoredCommand(
      JSON.stringify({
        id: "rename-orca-tabs",
        title: "Rename Orca Tabs",
        description: "Rename terminal tabs in the active Orca workspace.",
        icon: "🏷️",
        modality: "args",
        args: [
          {
            name: "harness",
            placeholder: "harness (default: pi)",
            optional: true,
            type: "dropdown",
            data: [
              { title: "Pi", value: "pi" },
              { title: "Preview (no agent)", value: "print" },
            ],
          },
          {
            name: "worktree",
            placeholder: "worktree (default: cwd)",
            optional: true,
            picker: "orca-worktree",
          },
        ],
        body: { lang: "bash", source: "printf '%s' \"$@\"" },
        x: { raycast: { mode: "fullOutput" } },
      }),
    );

    expect(command).toMatchObject({
      id: "rename-orca-tabs",
      title: "Rename Orca Tabs",
      modality: "args",
      args: [
        { name: "harness", type: "dropdown" },
        { name: "worktree", picker: "orca-worktree" },
      ],
    });
  });

  test("build argv in declared order and preserve missing positions", () => {
    const args = [{ name: "first" }, { name: "middle" }, { name: "last" }];
    expect(buildArgv(args, { first: "one", last: "three" })).toEqual(["one", "", "three"]);
  });
});

describe("Raycast extension Orca helpers", () => {
  test("filter archived worktrees, sort by activity, and strip refs/heads", () => {
    const options = parseWorktreeOptions(
      JSON.stringify({
        ok: true,
        result: {
          worktrees: [
            {
              displayName: "Older",
              path: "/work/older",
              branch: "refs/heads/feature/older",
              isArchived: false,
              lastActivityAt: 10,
            },
            {
              displayName: "Newest",
              path: "/work/newest",
              branch: "refs/heads/feature/newest",
              isArchived: false,
              lastActivityAt: 30,
            },
            {
              displayName: "Archived",
              path: "/work/archived",
              branch: "refs/heads/feature/archived",
              isArchived: true,
              lastActivityAt: 100,
            },
            { path: "/work/no-date", isArchived: false },
          ],
        },
      }),
    );

    expect(options.map((option) => option.title)).toEqual(["Newest", "Older", "/work/no-date"]);
    expect(options[0]).toMatchObject({
      value: "path:/work/newest",
      subtitle: "feature/newest",
    });
    expect(options[0]?.keywords).toEqual(
      expect.arrayContaining(["feature/newest", "feature", "newest", "work", "newest"]),
    );
    expect(options.some((option) => option.title === "Archived")).toBe(false);
  });

  test("return no options for malformed or unsuccessful Orca output", () => {
    expect(parseWorktreeOptions("not json")).toEqual([]);
    expect(parseWorktreeOptions(JSON.stringify({ ok: false, result: { worktrees: [] } }))).toEqual(
      [],
    );
  });
});
