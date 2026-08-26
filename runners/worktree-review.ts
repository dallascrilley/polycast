import { POLYCAST_VERSION } from "../src/constants.ts";
import { defineRunner } from "../src/runners/define.ts";

export default defineRunner({
  kind: "orca-plugin",
  id: "worktree-review",
  publisher: "polycast",
  title: "Worktree review",
  description: "Send a generic review prompt to the current worktree's only terminal.",
  version: POLYCAST_VERSION,
  engine: ">=1.4.188",
  commands: [
    {
      kind: "terminal-prompt",
      id: "review-worktree",
      title: "Review worktree",
      context: "worktree",
      prompt: "Review the current worktree and summarize its changes.",
      enter: "submit",
    },
  ],
});
