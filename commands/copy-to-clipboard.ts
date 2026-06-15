import { defineCommand } from "../src/define.ts";

/** Copy selected text to the clipboard (PopClip, Shortcuts, agent-cli). */
export default defineCommand({
  id: "copy-to-clipboard",
  title: "Copy to Clipboard",
  description: "Copy the selected text to the clipboard unchanged.",
  icon: "📋",
  modality: "text",
  author: "polycast",
  body: {
    lang: "bash",
    // Text modality pipes selection to stdin; pbcopy writes the macOS pasteboard.
    source: "pbcopy",
  },
});
