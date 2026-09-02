import { isUtf8 } from "node:buffer";
import { readSync } from "node:fs";
import { loadCommandJson } from "./commands-store.ts";
import { executeCommand } from "./run.ts";
import { type CommandDef, REMOTE_COMMAND_TARGETS } from "./types.ts";

export const REMOTE_PROTOCOL_VERSION = 1;
const MAX_REMOTE_TEXT_BYTES = 64 * 1024;
const FORCED_COMMAND = new RegExp(
  `^polycast-remote --command ([a-z0-9]+(?:-[a-z0-9]+)*) --protocol ${REMOTE_PROTOCOL_VERSION}$`,
);

export function isRemotelyCallable(cmd: CommandDef): boolean {
  if (!cmd.x?.remote) return false;
  return (
    !cmd.targets ||
    cmd.targets.some((target) => (REMOTE_COMMAND_TARGETS as readonly string[]).includes(target))
  );
}

export function parseForcedRemoteCommand(originalCommand: string | undefined): string {
  const match = FORCED_COMMAND.exec(originalCommand ?? "");
  if (!match) throw new Error("remote request must use the Polycast protocol command");
  return match[1]!;
}

export interface PolycastRemoteOptions {
  readonly commandsDir: string;
  readonly originalCommand?: string;
  readonly input?: Uint8Array;
}

function readBoundedStdin(limit: number): Uint8Array {
  const chunks: Buffer[] = [];
  let total = 0;
  while (total <= limit) {
    const chunk = Buffer.allocUnsafe(Math.min(16 * 1024, limit + 1 - total));
    const read = readSync(0, chunk, 0, chunk.length, null);
    if (read === 0) return Buffer.concat(chunks, total);
    chunks.push(chunk.subarray(0, read));
    total += read;
  }
  throw new Error(`remote text input exceeds ${MAX_REMOTE_TEXT_BYTES} bytes`);
}

/**
 * SSH forced-command entry point. It accepts no shell source: SSH_ORIGINAL_COMMAND
 * selects one explicit stored definition, and stdin is permitted only for text.
 */
export async function polycastRemote(options: PolycastRemoteOptions): Promise<number> {
  const id = parseForcedRemoteCommand(options.originalCommand);
  const cmd = await loadCommandJson(id, options.commandsDir);
  if (!isRemotelyCallable(cmd)) throw new Error(`command is not remotely callable: ${id}`);

  switch (cmd.modality) {
    case "none": {
      const input = options.input ?? readBoundedStdin(1);
      if (input.length !== 0) throw new Error(`remote command does not accept input: ${id}`);
      return executeCommand(cmd, { argv: [] });
    }
    case "text": {
      const input = options.input ?? readBoundedStdin(MAX_REMOTE_TEXT_BYTES);
      if (input.length > MAX_REMOTE_TEXT_BYTES) {
        throw new Error(`remote text input exceeds ${MAX_REMOTE_TEXT_BYTES} bytes`);
      }
      if (!isUtf8(input)) throw new Error("remote text input must be UTF-8");
      return executeCommand(cmd, { argv: [], text: Buffer.from(input).toString("utf8") });
    }
    case "args":
    case "files":
      throw new Error(`remote modality is not supported yet: ${cmd.modality}`);
    default: {
      const exhaustive: never = cmd.modality;
      return exhaustive;
    }
  }
}
