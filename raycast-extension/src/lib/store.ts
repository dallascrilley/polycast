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
}

const modalities: readonly StoredModality[] = ["text", "files", "args", "none"];
const argTypes: readonly StoredArgType[] = ["text", "password", "dropdown"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isModality(value: unknown): value is StoredModality {
  return typeof value === "string" && modalities.includes(value as StoredModality);
}

function isArgType(value: unknown): value is StoredArgType {
  return typeof value === "string" && argTypes.includes(value as StoredArgType);
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

    return command;
  } catch {
    return null;
  }
}

export function buildArgv(args: readonly StoredArg[], values: Record<string, string>): string[] {
  return args.map((arg) => values[arg.name] ?? "");
}
