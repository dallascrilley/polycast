import { defineCommand } from "../src/define.ts";

/** Files dragged onto Dropzone / Dropover — prints each basename. */
export default defineCommand({
  id: "basename-files",
  title: "Basename Files",
  description: "Print the basename of each dragged file path.",
  modality: "files",
  author: "polycast",
  body: {
    lang: "bash",
    source: ['for f in "$@"; do basename "$f"; done'].join("\n"),
  },
});
