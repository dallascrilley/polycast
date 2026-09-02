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
import { toolboxTargetCompatibility } from "./toolbox-compatibility.ts";
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

export type TargetCompatibility =
  | { readonly compatible: true }
  | { readonly compatible: false; readonly reason: string };

/** Decide whether one command can be represented by one target without executing it. */
export function commandTargetCompatibility(cmd: CommandDef, target: string): TargetCompatibility {
  const emitter = emitterFor(target);
  if (!emitter) throw new Error(`unknown target: "${target}"`);
  if (cmd.targets && !cmd.targets.includes(emitter.target)) {
    return { compatible: false, reason: "excluded by command target allowlist" };
  }
  if (!emitter.supports.includes(cmd.modality)) {
    return {
      compatible: false,
      reason: `input modality "${cmd.modality}" is unsupported`,
    };
  }

  const toolboxCompatibility = toolboxTargetCompatibility(cmd, emitter.target);
  if (!toolboxCompatibility.compatible) return toolboxCompatibility;

  if (emitter.canEmit && !emitter.canEmit(cmd)) {
    return { compatible: false, reason: "surface-specific command requirements are not satisfied" };
  }
  return { compatible: true };
}

export interface TargetOutput {
  readonly target: CommandTarget;
  readonly files: readonly EmittedFile[];
  /** True when the emitter produced nothing because the command is incompatible. */
  readonly skipped: boolean;
  readonly reason?: string;
}

/** Run one command through every requested emitter (default: all). */
export function emitCommand(
  cmd: CommandDef,
  targets: readonly string[] = emitters.map((e) => e.target),
): TargetOutput[] {
  return targets.map((target) => {
    const emitter = emitterFor(target);
    if (!emitter) throw new Error(`unknown target: "${target}"`);
    const compatibility = commandTargetCompatibility(cmd, target);
    if (!compatibility.compatible) {
      return {
        target: emitter.target,
        files: [],
        skipped: true,
        reason: compatibility.reason,
      };
    }
    const files = emitter.emit(cmd);
    return files.length === 0
      ? {
          target: emitter.target,
          files,
          skipped: true,
          reason: "surface-specific command requirements are not satisfied",
        }
      : { target: emitter.target, files, skipped: false };
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
        (command) =>
          (!command.targets || command.targets.includes(emitter.target)) &&
          (command.delegation?.kind !== "toolbox" ||
            commandTargetCompatibility(command, emitter.target).compatible),
      );
      const files = emitter.emitCatalog(selected);
      return { target: emitter.target, files, skipped: files.length === 0 };
    })
    .filter((r): r is TargetOutput => r != null);
}
