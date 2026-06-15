import type { CommandDef, EmittedFile, Emitter } from "../types.ts";

/**
 * Emits a PopClip shell-script extension: a `<id>.popclipext/` bundle with a
 * `Config.json` and a wrapper script. PopClip acts on a text selection, which
 * it exposes to the script via the `POPCLIP_TEXT` env var — so this surface
 * supports the `text` modality only.
 *
 * This is where the I/O modality contract earns its keep: the command body is
 * written once as a pure `stdin -> stdout` function, and this emitter injects
 * the wrapper that pipes PopClip's `POPCLIP_TEXT` into that contract. A
 * different emitter (Dropzone) would inject a `"$@"`-paths wrapper instead, over
 * the very same body.
 */
export const popclip: Emitter = {
  target: "popclip",
  supports: ["text"],

  emit(cmd: CommandDef): EmittedFile[] {
    if (!this.supports.includes(cmd.modality)) return [];

    const config = {
      identifier: `com.polycast.${cmd.id}`,
      name: cmd.title,
      ...(cmd.icon ? { icon: cmd.icon } : {}),
      description: cmd.description,
      actions: [{ title: cmd.title, "shell script file": "script.sh" }],
      ...(cmd.x?.popclip?.requirements ? { requirements: cmd.x.popclip.requirements } : {}),
    };

    // Wrapper: feed the selection into the body's stdin contract.
    const wrapper = [
      "#!/bin/bash",
      "set -euo pipefail",
      'printf %s "${POPCLIP_TEXT-}" | {',
      cmd.body.source.trimEnd(),
      "}",
      "",
    ].join("\n");

    return [
      {
        path: `${cmd.id}.popclipext/Config.json`,
        contents: `${JSON.stringify(config, null, 2)}\n`,
      },
      {
        path: `${cmd.id}.popclipext/script.sh`,
        contents: wrapper,
        mode: 0o755,
      },
    ];
  },
};
