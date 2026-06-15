import { defineCommand } from "../src/define.ts";

/** A text-selection command — renders to PopClip. */
export default defineCommand({
  id: "uppercase",
  title: "Uppercase",
  description: "Convert the selected text to UPPERCASE.",
  icon: "🔠",
  modality: "text",
  author: "polycast",
  body: {
    lang: "bash",
    // Reads the selection from stdin (the emitter wires the surface to it).
    source: "tr '[:lower:]' '[:upper:]'",
  },
});
