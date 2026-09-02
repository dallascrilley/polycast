import { agentCli } from "./emitters/agent-cli.ts";
import { dropoverScript } from "./emitters/dropover-script.ts";
import { dropzone } from "./emitters/dropzone.ts";
import { popclip } from "./emitters/popclip.ts";
import { raycastQuicklink } from "./emitters/raycast-quicklink.ts";
import { raycastScript } from "./emitters/raycast-script.ts";
import { raycastSnippet } from "./emitters/raycast-snippet.ts";
import { shortcutsCherri } from "./emitters/shortcuts-cherri.ts";
import { shortcutsRemoteSsh } from "./emitters/shortcuts-remote-ssh.ts";
import { termuxShortcut } from "./emitters/termux-shortcut.ts";
import type { CommandDef, CommandTarget, EmittedFile, Emitter } from "./types.ts";

/**
 * The emitter registry. Adding a launcher target is: write an Emitter, add it
 * here. Every existing command instantly gains the new surface — that is the
 * compounding leverage polycast exists for.
 */
export const emitters: readonly Emitter[] = [
  raycastScript,
  popclip,
  dropzone,
  dropoverScript,
  shortcutsCherri,
  shortcutsRemoteSsh,
  termuxShortcut,
  raycastSnippet,
  raycastQuicklink,
  agentCli,
];

export function emitterFor(target: string): Emitter | undefined {
  return emitters.find((e) => e.target === target);
}

export interface TargetOutput {
  readonly target: CommandTarget;
  readonly files: readonly EmittedFile[];
  /** True when the emitter produced nothing because the modality is incompatible. */
  readonly skipped: boolean;
}

/** Run one command through every requested emitter (default: all). */
export function emitCommand(
  cmd: CommandDef,
  targets: readonly string[] = emitters.map((e) => e.target),
): TargetOutput[] {
  return targets.map((target) => {
    const emitter = emitterFor(target);
    if (!emitter) throw new Error(`unknown target: "${target}"`);
    if (cmd.targets && !cmd.targets.includes(emitter.target)) {
      return { target: emitter.target, files: [], skipped: true };
    }
    const files = emitter.emit(cmd);
    return { target: emitter.target, files, skipped: files.length === 0 };
  });
}

/** Catalog pass for targets that aggregate across commands (snippets, manifest). */
export function emitCatalogs(
  commands: readonly CommandDef[],
  targets: readonly string[] = emitters.map((e) => e.target),
): TargetOutput[] {
  return targets
    .map((target) => {
      const emitter = emitterFor(target);
      if (!emitter?.emitCatalog) return undefined;
      const selected = commands.filter(
        (command) => !command.targets || command.targets.includes(emitter.target),
      );
      const files = emitter.emitCatalog(selected);
      return { target: emitter.target, files, skipped: files.length === 0 };
    })
    .filter((r): r is TargetOutput => r != null);
}
