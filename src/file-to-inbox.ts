#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { copyFile, mkdir, open, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

export const FILE_TO_INBOX_ID = "file-to-inbox";
export const FILE_TO_INBOX_TAG = "Review";
export const FILE_TO_INBOX_RECEIPT_DIR = ".polycast-receipts";

export const EX_USAGE = 64;
export const EX_NOINPUT = 66;

export interface FileToInboxOptions {
  readonly sources: readonly string[];
  readonly inbox: string;
  readonly tag: string;
  readonly dryRun: boolean;
}

export interface FileToInboxEntry {
  readonly source: string;
  readonly destination: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly tag: string;
  readonly copied: boolean;
}

export interface FileToInboxReceipt {
  readonly schemaVersion: 1;
  readonly commandId: typeof FILE_TO_INBOX_ID;
  readonly recordedAt: string;
  readonly dryRun: boolean;
  readonly inbox: string;
  readonly tag: string;
  readonly receiptPath: string | null;
  readonly entries: readonly FileToInboxEntry[];
}

export function defaultInboxDir(): string {
  const override = process.env.POLYCAST_INBOX_DIR?.trim();
  return override && override.length > 0 ? resolve(override) : join(homedir(), "Inbox");
}

export function parseFileToInboxArgs(
  argv: readonly string[],
): { readonly help: true } | { readonly error: string } | { readonly options: FileToInboxOptions } {
  let dryRun = false;
  let inbox: string | undefined;
  let tag = FILE_TO_INBOX_TAG;
  const sources: string[] = [];
  let rest = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (!rest) {
      if (arg === "--") {
        rest = true;
        continue;
      }
      if (arg === "--help" || arg === "-h") return { help: true };
      if (arg === "--dry-run") {
        dryRun = true;
        continue;
      }
      if (arg === "--inbox") {
        const value = argv[++i];
        if (!value) return { error: "--inbox needs a directory" };
        inbox = value;
        continue;
      }
      if (arg === "--tag") {
        const value = argv[++i];
        if (!value) return { error: "--tag needs a name" };
        tag = value;
        continue;
      }
      if (arg.startsWith("-")) return { error: `unknown flag: ${arg}` };
    }
    sources.push(arg);
  }

  return {
    options: {
      sources,
      inbox: inbox ? resolve(inbox) : defaultInboxDir(),
      tag,
      dryRun,
    },
  };
}

export function fileToInboxUsage(): string {
  return [
    "Copy files into Inbox, tag them Review, and write a receipt. Originals stay in place.",
    "",
    "Usage: file-to-inbox [--dry-run] [--inbox DIR] [--tag TAG] [--] path [path...]",
    "",
    "POLYCAST_INBOX_DIR overrides the default inbox (~/Inbox) when --inbox is omitted.",
  ].join("\n");
}

function collisionName(filename: string, attempt: number): string {
  if (attempt === 0) return filename;
  const ext = extname(filename);
  if (!ext || ext === filename) return `${filename}-${attempt + 1}`;
  return `${filename.slice(0, -ext.length)}-${attempt + 1}${ext}`;
}

async function digestFile(path: string): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash("sha256");
  const fh = await open(path, "r");
  try {
    const info = await fh.stat();
    const buf = Buffer.alloc(64 * 1024);
    let offset = 0;
    while (offset < info.size) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, offset);
      if (bytesRead === 0) break;
      hash.update(buf.subarray(0, bytesRead));
      offset += bytesRead;
    }
    return { bytes: info.size, sha256: hash.digest("hex") };
  } finally {
    await fh.close();
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function applyFinderTag(path: string, tag: string): void {
  if (process.platform !== "darwin") return;
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<array>",
    `  <string>${escapeXml(tag)}</string>`,
    "</array>",
    "</plist>",
    "",
  ].join("\n");
  const dir = mkdtempSync(join(tmpdir(), "polycast-finder-tag-"));
  const plistPath = join(dir, "tags.plist");
  try {
    writeFileSync(plistPath, xml);
    const converted = spawnSync("plutil", ["-convert", "binary1", plistPath], { encoding: "utf8" });
    if (converted.status !== 0) {
      throw new Error(converted.stderr.trim() || "plutil failed to encode Finder tags");
    }
    const hex = readFileSync(plistPath).toString("hex");
    const tagged = spawnSync("xattr", ["-wx", "com.apple.metadata:kMDItemUserTags", hex, path], {
      encoding: "utf8",
    });
    if (tagged.status !== 0) {
      throw new Error(tagged.stderr.trim() || `failed to tag ${path}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function readFinderTagPlist(path: string): string {
  const dumped = spawnSync("xattr", ["-px", "com.apple.metadata:kMDItemUserTags", path], {
    encoding: "utf8",
  });
  if (dumped.status !== 0) {
    throw new Error(dumped.stderr.trim() || `no Finder tags on ${path}`);
  }
  const hex = dumped.stdout.replace(/\s+/g, "");
  const dir = mkdtempSync(join(tmpdir(), "polycast-finder-tag-read-"));
  const plistPath = join(dir, "tags.plist");
  try {
    writeFileSync(plistPath, Buffer.from(hex, "hex"));
    const xml = spawnSync("plutil", ["-convert", "xml1", "-o", "-", plistPath], {
      encoding: "utf8",
    });
    if (xml.status !== 0) {
      throw new Error(xml.stderr.trim() || "plutil failed to decode Finder tags");
    }
    return xml.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function reserveDestination(inbox: string, filename: string): Promise<string> {
  let attempt = 0;
  while (true) {
    const dest = join(inbox, collisionName(filename, attempt));
    try {
      const fh = await open(dest, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o644);
      await fh.close();
      return dest;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      attempt += 1;
    }
  }
}

async function nextDryRunDestination(
  inbox: string,
  filename: string,
  taken: Set<string>,
): Promise<string> {
  let attempt = 0;
  while (true) {
    const dest = join(inbox, collisionName(filename, attempt));
    if (!taken.has(dest)) {
      try {
        await stat(dest);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return dest;
        throw err;
      }
    }
    attempt += 1;
  }
}

export async function fileToInbox(options: FileToInboxOptions): Promise<FileToInboxReceipt> {
  if (options.sources.length === 0) {
    throw Object.assign(new Error("file-to-inbox needs at least one file path"), {
      code: EX_USAGE,
    });
  }

  const inbox = resolve(options.inbox);
  if (!options.dryRun) await mkdir(inbox, { recursive: true });

  const taken = new Set<string>();
  const entries: FileToInboxEntry[] = [];

  for (const raw of options.sources) {
    const source = resolve(raw);
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(source);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw Object.assign(new Error(`file not found: ${source}`), { code: EX_NOINPUT });
      }
      throw err;
    }
    if (!info.isFile()) {
      throw Object.assign(new Error(`not a regular file: ${source}`), { code: EX_USAGE });
    }

    const digest = await digestFile(source);
    const destination = options.dryRun
      ? await nextDryRunDestination(inbox, basename(source), taken)
      : await reserveDestination(inbox, basename(source));
    taken.add(destination);

    if (!options.dryRun) {
      await copyFile(source, destination);
      const copied = await digestFile(destination);
      if (copied.sha256 !== digest.sha256 || copied.bytes !== digest.bytes) {
        throw new Error(`copy integrity failed: ${source} -> ${destination}`);
      }
      applyFinderTag(destination, options.tag);
    }

    entries.push({
      source,
      destination,
      bytes: digest.bytes,
      sha256: digest.sha256,
      tag: options.tag,
      copied: !options.dryRun,
    });
  }

  const recordedAt = new Date().toISOString();
  let receiptPath: string | null = null;
  const receipt: FileToInboxReceipt = {
    schemaVersion: 1,
    commandId: FILE_TO_INBOX_ID,
    recordedAt,
    dryRun: options.dryRun,
    inbox,
    tag: options.tag,
    receiptPath,
    entries,
  };

  if (!options.dryRun) {
    const receiptDir = join(inbox, FILE_TO_INBOX_RECEIPT_DIR);
    await mkdir(receiptDir, { recursive: true });
    const stamp = recordedAt.replaceAll(":", "").replaceAll(".", "");
    receiptPath = join(receiptDir, `${stamp}-${randomBytes(4).toString("hex")}.json`);
    const written = { ...receipt, receiptPath };
    await writeFile(receiptPath, `${JSON.stringify(written, null, 2)}\n`);
    return written;
  }

  return receipt;
}

export async function runFileToInbox(argv: readonly string[]): Promise<number> {
  const parsed = parseFileToInboxArgs(argv);
  if ("help" in parsed) {
    console.log(fileToInboxUsage());
    return 0;
  }
  if ("error" in parsed) {
    console.error(parsed.error);
    console.error(fileToInboxUsage());
    return EX_USAGE;
  }
  try {
    const receipt = await fileToInbox(parsed.options);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    const code = (err as { code?: number }).code;
    return typeof code === "number" ? code : 1;
  }
}

if (import.meta.main) {
  process.exit(await runFileToInbox(process.argv.slice(2)));
}
