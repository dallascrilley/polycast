import { toolboxTargetCompatibility } from "../../../src/toolbox-compatibility";
import type { CrossTargetHints, ToolboxDelegation } from "../../../src/types";

export type StoredModality = "text" | "files" | "args" | "none";
export type StoredArgType = "text" | "password" | "dropdown";

export interface StoredArgOption {
  readonly title: string;
  readonly value: string;
}

export interface StoredArg {
  readonly name: string;
  readonly placeholder?: string;
  readonly optional?: boolean;
  readonly type?: StoredArgType;
  readonly data?: readonly StoredArgOption[];
  readonly picker?: "orca-worktree";
}

export interface StoredCommand {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon?: string;
  readonly modality: StoredModality;
  readonly args?: readonly StoredArg[];
  readonly delegation?: ToolboxDelegation;
  readonly targets?: readonly string[];
  readonly x?: Pick<CrossTargetHints, "raycast">;
}

const modalities: readonly StoredModality[] = ["text", "files", "args", "none"];
const argTypes: readonly StoredArgType[] = ["text", "password", "dropdown"];
const raycastModes: readonly string[] = ["silent", "fullOutput", "compact", "inline"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isModality(value: unknown): value is StoredModality {
  return typeof value === "string" && modalities.includes(value as StoredModality);
}

function isArgType(value: unknown): value is StoredArgType {
  return typeof value === "string" && argTypes.includes(value as StoredArgType);
}

function parseDelegation(value: unknown): ToolboxDelegation | null | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    value.kind !== "toolbox" ||
    value.contract !== "toolbox-polycast-adapter/v1" ||
    (value.effectClass !== "inspect" &&
      value.effectClass !== "prepare" &&
      value.effectClass !== "mutate" &&
      value.effectClass !== "integrate") ||
    value.output !== "canonical"
  ) {
    return null;
  }
  return {
    kind: "toolbox",
    contract: "toolbox-polycast-adapter/v1",
    effectClass: value.effectClass,
    output: "canonical",
  };
}

function parseRaycastHints(
  value: unknown,
): Pick<NonNullable<CrossTargetHints["raycast"]>, "mode" | "needsConfirmation"> | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;

  if (value.mode !== undefined && !raycastModes.includes(String(value.mode))) return null;
  if (value.needsConfirmation !== undefined && typeof value.needsConfirmation !== "boolean") {
    return null;
  }

  const hints: {
    mode?: NonNullable<CrossTargetHints["raycast"]>["mode"];
    needsConfirmation?: boolean;
  } = {};
  if (value.mode !== undefined) {
    hints.mode = value.mode as NonNullable<CrossTargetHints["raycast"]>["mode"];
  }
  if (value.needsConfirmation !== undefined) hints.needsConfirmation = value.needsConfirmation;
  return hints;
}

function parseTargets(value: unknown): readonly string[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((target) => typeof target !== "string" || !target)) {
    return null;
  }
  return value;
}

function parseArg(value: unknown): StoredArg | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) return null;

  const arg: {
    name: string;
    placeholder?: string;
    optional?: boolean;
    type?: StoredArgType;
    data?: readonly StoredArgOption[];
    picker?: "orca-worktree";
  } = { name: value.name };

  if (value.placeholder !== undefined) {
    if (typeof value.placeholder !== "string") return null;
    arg.placeholder = value.placeholder;
  }
  if (value.optional !== undefined) {
    if (typeof value.optional !== "boolean") return null;
    arg.optional = value.optional;
  }
  if (value.type !== undefined) {
    if (!isArgType(value.type)) return null;
    arg.type = value.type;
  }
  if (value.picker !== undefined) {
    if (value.picker !== "orca-worktree" || (arg.type !== undefined && arg.type !== "text")) {
      return null;
    }
    arg.picker = value.picker;
  }
  if (value.data !== undefined) {
    if (!Array.isArray(value.data)) return null;
    const data: StoredArgOption[] = [];
    for (const option of value.data) {
      if (
        !isRecord(option) ||
        typeof option.title !== "string" ||
        typeof option.value !== "string"
      ) {
        return null;
      }
      data.push({ title: option.title, value: option.value });
    }
    arg.data = data;
  }

  return arg;
}

export function parseStoredCommand(raw: string): StoredCommand | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;

    if (
      typeof parsed.id !== "string" ||
      !parsed.id.trim() ||
      typeof parsed.title !== "string" ||
      !parsed.title.trim() ||
      typeof parsed.description !== "string" ||
      !isModality(parsed.modality)
    ) {
      return null;
    }

    const command: {
      id: string;
      title: string;
      description: string;
      icon?: string;
      modality: StoredModality;
      args?: readonly StoredArg[];
      delegation?: ToolboxDelegation;
      targets?: readonly string[];
      x?: Pick<CrossTargetHints, "raycast">;
    } = {
      id: parsed.id,
      title: parsed.title,
      description: parsed.description,
      modality: parsed.modality,
    };

    if (parsed.icon !== undefined) {
      if (typeof parsed.icon !== "string") return null;
      command.icon = parsed.icon;
    }
    if (parsed.args !== undefined) {
      if (!Array.isArray(parsed.args)) return null;
      const args: StoredArg[] = [];
      for (const arg of parsed.args) {
        const parsedArg = parseArg(arg);
        if (!parsedArg) return null;
        args.push(parsedArg);
      }
      command.args = args;
    }
    if (command.modality === "args" && !command.args) return null;

    const delegation = parseDelegation(parsed.delegation);
    if (delegation === null) return null;
    if (delegation) command.delegation = delegation;

    const targets = parseTargets(parsed.targets);
    if (targets === null) return null;
    if (targets) command.targets = targets;

    if (parsed.x !== undefined) {
      if (!isRecord(parsed.x)) return null;
      const raycast = parseRaycastHints(parsed.x.raycast);
      if (raycast === null) return null;
      if (raycast) command.x = { raycast };
    }

    return command;
  } catch {
    return null;
  }
}

/** Filter the command store to commands the flagship Raycast surface can honor. */
export function isRaycastVisible(command: StoredCommand): boolean {
  if (command.modality === "files") return false;
  if (!command.delegation) return true;
  if (command.targets && !command.targets.includes("raycast-script")) return false;
  return toolboxTargetCompatibility(command, "raycast-script").compatible;
}

export function filterRaycastCommands(commands: readonly StoredCommand[]): StoredCommand[] {
  return commands
    .filter(isRaycastVisible)
    .sort((left, right) => left.title.localeCompare(right.title));
}

export function buildArgv(args: readonly StoredArg[], values: Record<string, string>): string[] {
  return args.map((arg) => values[arg.name] ?? "");
}
