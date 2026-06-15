import { defineCommand } from "../src/define.ts";

/** An argument command — renders to a Raycast script command. */
export default defineCommand({
  id: "open-repo",
  title: "Open Code Repo",
  description: "Open a subfolder of ~/Code in Finder.",
  icon: "📂",
  modality: "args",
  author: "polycast",
  args: [{ name: "folder", placeholder: "repo name" }],
  x: { raycast: { mode: "silent", packageName: "Navigation" } },
  body: {
    lang: "bash",
    source: ["set -euo pipefail", 'open "$HOME/Code/$1"'].join("\n"),
  },
});
