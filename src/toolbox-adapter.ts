import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { defineCommand } from "./define.ts";
import type {
  CommandArg,
  CommandDef,
  CommandTarget,
  CrossTargetHints,
  Modality,
  ToolboxEffectClass,
} from "./types.ts";

/** The versioned boundary implemented by the canonical Toolbox executable. */
export const TOOLBOX_ADAPTER_CONTRACT = "toolbox-polycast-adapter/v1" as const;

/** Optional setup-time override for the resolved canonical executable. */
export const TOOLBOX_EXECUTABLE_ENV = "POLYCAST_TOOLBOX_BIN" as const;

export interface ToolboxBinding {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** A resolved regular `bin/toolbox` executable, not a shell command string. */
  readonly executable: string;
  /** Canonical Toolbox namespace and command prefix, in order. */
  readonly fixedArgv: readonly string[];
  readonly modality: Modality;
  /** Launcher collection metadata only; Toolbox validates the final argv. */
  readonly args: readonly CommandArg[];
  /** Classification, not authorization. Toolbox remains the policy owner. */
  readonly effectClass: ToolboxEffectClass;
  /** Keep canonical output, failure, and receipt semantics. */
  readonly output: "canonical";
  readonly icon?: string;
  readonly targets?: readonly CommandTarget[];
  readonly x?: CrossTargetHints;
  readonly author?: string;
}

/**
 * Resolve the canonical Toolbox executable without invoking it or consulting
 * Toolbox state. The returned path is suitable for an `exec` CommandDef body.
 *
 * A PATH lookup is only accepted when its real path is the regular
 * `<some-root>/bin/toolbox` file. This keeps a launcher from silently binding
 * to an unrelated command with the same name.
 */
export function resolveToolboxExecutable(requested = process.env[TOOLBOX_EXECUTABLE_ENV]): string {
  const candidate = requested?.trim();
  const path = candidate
    ? candidate.includes("/")
      ? resolve(candidate)
      : findOnPath(candidate)
    : findOnPath("toolbox");

  if (!path) {
    const detail = candidate ? ` from ${JSON.stringify(candidate)}` : " on PATH";
    throw new Error(`Toolbox resolution failed: canonical bin/toolbox was not found${detail}`);
  }

  let resolved: string;
  try {
    resolved = realpathSync(path);
  } catch {
    throw new Error(`Toolbox resolution failed: cannot resolve ${JSON.stringify(path)}`);
  }

  let executableIsUsable = false;
  try {
    executableIsUsable = statSync(resolved).isFile();
    accessSync(resolved, constants.X_OK);
  } catch {
    executableIsUsable = false;
  }
  if (
    !executableIsUsable ||
    basename(dirname(resolved)) !== "bin" ||
    basename(resolved) !== "toolbox"
  ) {
    throw new Error(
      `Toolbox resolution failed: expected an executable regular bin/toolbox, got ${JSON.stringify(resolved)}`,
    );
  }
  return resolved;
}

function findOnPath(name: string): string | undefined {
  for (const entry of (process.env.PATH ?? "").split(delimiter)) {
    if (!entry) continue;
    const candidate = join(entry, name);
    try {
      if (statSync(candidate).isFile()) {
        accessSync(candidate, constants.X_OK);
        return candidate;
      }
    } catch {
      // Continue searching the remaining PATH entries.
    }
  }
  return undefined;
}

/**
 * Turn a resolved Toolbox binding into the canonical Polycast exec shape.
 * There is deliberately no wrapper process, shell body, output envelope, or
 * adapter-owned receipt handling here.
 */
export function defineToolboxCommand(binding: ToolboxBinding): CommandDef {
  return defineCommand({
    id: binding.id,
    title: binding.title,
    description: binding.description,
    ...(binding.icon ? { icon: binding.icon } : {}),
    modality: binding.modality,
    args: [...binding.args],
    body: {
      lang: "exec",
      executable: binding.executable,
      args: [...binding.fixedArgv],
    },
    delegation: {
      kind: "toolbox",
      contract: TOOLBOX_ADAPTER_CONTRACT,
      effectClass: binding.effectClass,
      output: binding.output,
    },
    ...(binding.targets ? { targets: [...binding.targets] } : {}),
    ...(binding.x ? { x: { ...binding.x } } : {}),
    ...(binding.author ? { author: binding.author } : {}),
  });
}

/** Alias using the adapter's noun-first name for callers defining bindings. */
export const toolboxCommand = defineToolboxCommand;

/** Runtime classifier for a validated command carrying Toolbox metadata. */
export function isToolboxCommand(cmd: CommandDef): boolean {
  return (
    cmd.body.lang === "exec" &&
    cmd.delegation?.kind === "toolbox" &&
    cmd.delegation.contract === TOOLBOX_ADAPTER_CONTRACT
  );
}
