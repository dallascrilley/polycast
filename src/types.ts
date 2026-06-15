/**
 * The canonical command IR (intermediate representation).
 *
 * Every launcher surface polycast targets — Raycast script commands, PopClip
 * extensions, Dropzone actions, Apple Shortcuts, standalone agent CLIs — is the
 * same triple: metadata header + script body + I/O contract. A `CommandDef` is
 * that triple, expressed once. Emitters render it into each target's dialect.
 *
 * See docs/DESIGN.md for the full rationale.
 */

/**
 * What the command body receives as input. This is the single semantic that
 * makes one body legally renderable to multiple surfaces — and the reason an
 * emitter skips a command it cannot represent (a `files` action is not a valid
 * text-only PopClip extension).
 */
export type Modality =
  | "text" // a text selection (PopClip, Shortcuts share sheet)
  | "files" // one or more dragged file paths (Dropzone)
  | "args" // typed launcher arguments (Raycast argument fields)
  | "none"; // no input; pure launcher trigger

export interface CommandArg {
  readonly name: string;
  readonly placeholder?: string;
  readonly optional?: boolean;
}

export type BodyLang = "bash" | "node" | "applescript";

export interface CommandBody {
  readonly lang: BodyLang;
  /**
   * The body is a pure `input -> stdout` function. It reads its input per the
   * command's modality (stdin for text, "$@" paths for files, argv for args)
   * and writes results to stdout. Emitters inject the per-surface wrapper that
   * adapts the launcher's native input into this contract.
   */
  readonly source: string;
}

/** Target-specific hints that have no home in the language-agnostic core. */
export interface CrossTargetHints {
  readonly raycast?: {
    readonly mode?: "silent" | "fullOutput" | "compact" | "inline";
    readonly packageName?: string;
  };
  readonly popclip?: {
    readonly requirements?: readonly string[];
  };
  readonly dropzone?: {
    readonly events?: readonly ("Dragged" | "Clicked")[];
  };
  readonly shortcuts?: {
    readonly name?: string;
  };
}

export interface CommandDef {
  /** Stable, unique, kebab-case identifier. */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Emoji or path to an icon asset. */
  readonly icon?: string;
  readonly modality: Modality;
  /** Required when `modality === "args"`. */
  readonly args?: readonly CommandArg[];
  readonly body: CommandBody;
  readonly x?: CrossTargetHints;
  readonly author?: string;
}

/** One file an emitter wants written to the build/output tree. */
export interface EmittedFile {
  /** Path relative to the emitter's output root. */
  readonly path: string;
  readonly contents: string;
  /** chmod mode (e.g. 0o755 for an executable). Defaults to 0o644. */
  readonly mode?: number;
}

/**
 * A target adapter. Adding a new launcher is implementing one of these and
 * registering it — every existing command instantly gains the new surface.
 */
export interface Emitter {
  /** Stable target id, e.g. "raycast-script". */
  readonly target: string;
  /** Modalities this surface can represent. */
  readonly supports: readonly Modality[];
  /** Render the command, or return [] when the command is incompatible. */
  emit(cmd: CommandDef): readonly EmittedFile[];
}
