import { fileURLToPath } from "node:url";
import { defineCommand } from "../src/define.ts";

const executable = fileURLToPath(new URL("../src/file-to-inbox.ts", import.meta.url));

/** Copy dropped files into Inbox through the shared headless implementation. */
export default defineCommand({
  id: "file-to-inbox",
  title: "File to Inbox",
  description:
    "Copy files into Inbox, tag them Review, and write a receipt. Originals stay in place.",
  icon: "📥",
  modality: "files",
  author: "polycast",
  x: {
    shortcuts: {
      name: "File to Inbox",
      from: "sharesheet",
      inputs: ["file"],
    },
    dropzone: {
      events: ["Dragged"],
      handles: "Files",
    },
  },
  body: {
    lang: "exec",
    executable,
  },
});
