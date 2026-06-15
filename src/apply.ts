import { spawn } from "node:child_process";
import { access, chmod, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { OWNERSHIP_MARKER } from "./constants.ts";
import { formatDropoverImportNote, parseDropoverManifest } from "./dropover-manifest.ts";
import { targetNeedsCommandsStore } from "./shim.ts";

export interface ApplyOptions {
  readonly outRoot: string;
  readonly write: boolean;
  readonly targets?: readonly string[];
}

export interface ApplyResult {
  readonly target: string;
  readonly action: string;
  readonly path: string;
}

function expandHome(p: string): string {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

function dropzoneActionsDir(): string {
  if (process.env.POLYCAST_DROPZONE_ACTIONS)
    return expandHome(process.env.POLYCAST_DROPZONE_ACTIONS);
  return expandHome("~/Library/Application Support/Dropzone 5/Actions");
}

function popclipExtensionsDir(): string {
  return expandHome(
    process.env.POLYCAST_POPCLIP_EXTENSIONS ?? "~/Library/Application Support/PopClip/Extensions",
  );
}

function agentBinDir(): string {
  return expandHome(process.env.POLYCAST_AGENT_BIN ?? "~/.agents/tools");
}

function commandsStoreDir(): string {
  return expandHome(process.env.POLYCAST_COMMANDS_DIR ?? "~/.polycast/commands");
}

function raycastScriptDir(): string {
  return expandHome(
    process.env.POLYCAST_RAYCAST_DIR ?? "~/Code/dotfiles/raycast/script-commands/_enabled",
  );
}

function dropoverStagingDir(): string {
  return expandHome(
    process.env.POLYCAST_DROPOVER_SCRIPTS ??
      "~/Library/Containers/me.damir.dropover-mac/Data/Documents/.polycast-scripts",
  );
}

function parentDir(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : p;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** True when polycast may overwrite an existing install path. */
async function isPolycastOwned(dest: string): Promise<boolean> {
  if (await pathExists(`${dest}.polycast-owned`)) return true;
  if (await pathExists(join(parentDir(dest), OWNERSHIP_MARKER))) return true;
  const popclipRoot = dest.split(".popclipext")[0];
  if (popclipRoot !== dest) {
    const bundleRoot = `${popclipRoot}.popclipext`;
    if (await pathExists(join(bundleRoot, OWNERSHIP_MARKER))) return true;
  }
  return false;
}

async function installAllowed(
  dest: string,
  write: boolean,
): Promise<"install" | "would install" | "refused"> {
  if (!(await pathExists(dest))) return write ? "install" : "would install";
  if (await isPolycastOwned(dest)) return write ? "install" : "would install";
  return "refused";
}

async function bundleInstallAllowed(
  destBundle: string,
  write: boolean,
): Promise<"install" | "would install" | "refused"> {
  if (!(await pathExists(destBundle))) return write ? "install" : "would install";
  if (await pathExists(join(destBundle, OWNERSHIP_MARKER))) {
    return write ? "install" : "would install";
  }
  return "refused";
}

async function copyTree(
  src: string,
  dest: string,
  write: boolean,
  target?: string,
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      if (write) await mkdir(to, { recursive: true });
      results.push(...(await copyTree(from, to, write, target)));
    } else {
      const action = await installAllowed(to, write);
      results.push({
        target: target ?? basename(dest),
        action,
        path: to,
      });
      if (write && action === "install") {
        await mkdir(parentDir(to), { recursive: true });
        await cp(from, to, { force: true });
      }
    }
  }
  return results;
}

async function installFile(
  target: string,
  src: string,
  dest: string,
  write: boolean,
  mode?: number,
): Promise<ApplyResult> {
  const action = await installAllowed(dest, write);
  if (write && action === "install") {
    await mkdir(parentDir(dest), { recursive: true });
    await cp(src, dest, { force: true });
    if (mode) await chmod(dest, mode);
  }
  return { target, action, path: dest };
}

function markerResult(
  target: string,
  installAction: ApplyResult["action"],
  markerDest: string,
  write: boolean,
): ApplyResult | undefined {
  if (installAction === "refused") return undefined;
  return {
    target,
    action: write && installAction === "install" ? "marker" : "would marker",
    path: markerDest,
  };
}

async function writeMarker(
  markerDest: string,
  installAction: ApplyResult["action"],
  write: boolean,
): Promise<void> {
  if (write && installAction === "install") {
    await mkdir(parentDir(markerDest), { recursive: true });
    await writeFile(markerDest, "polycast\n");
  }
}

async function applyBundleTree(
  target: string,
  srcBundle: string,
  destBundle: string,
  write: boolean,
): Promise<ApplyResult[]> {
  const bundleAction = await bundleInstallAllowed(destBundle, write);
  if (bundleAction === "refused") {
    return [{ target, action: "refused", path: destBundle }];
  }
  return copyTree(srcBundle, destBundle, write, target);
}

async function applyTarget(target: string, srcDir: string, write: boolean): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];

  if (target === "raycast-script") {
    const dest = raycastScriptDir();
    const entries = await readdir(srcDir).catch(() => []);
    for (const name of entries) {
      if (!name.endsWith(".sh")) continue;
      const scriptDest = join(dest, name);
      const fileResult = await installFile(target, join(srcDir, name), scriptDest, write, 0o755);
      results.push(fileResult);
      const markerDest = join(dest, `${name}.polycast-owned`);
      const marker = markerResult(target, fileResult.action, markerDest, write);
      if (marker) {
        await writeMarker(markerDest, fileResult.action, write);
        results.push(marker);
      }
    }
    return results;
  }

  if (target === "popclip") {
    const dest = popclipExtensionsDir();
    const entries = await readdir(srcDir).catch(() => []);
    for (const name of entries) {
      if (!name.endsWith(".popclipext")) continue;
      results.push(...(await applyBundleTree(target, join(srcDir, name), join(dest, name), write)));
    }
    return results;
  }

  if (target === "dropzone") {
    const dest = dropzoneActionsDir();
    const entries = await readdir(srcDir).catch(() => []);
    for (const name of entries) {
      if (!name.endsWith(".dzbundle")) continue;
      results.push(...(await applyBundleTree(target, join(srcDir, name), join(dest, name), write)));
    }
    return results;
  }

  if (target === "dropover-script") {
    const dest = dropoverStagingDir();
    const entries = await readdir(srcDir).catch(() => []);
    for (const name of entries) {
      if (!name.endsWith(".sh") && name !== "manifest.json" && !name.endsWith(".polycast-owned"))
        continue;
      results.push(
        await installFile(
          target,
          join(srcDir, name),
          join(dest, name),
          write,
          name.endsWith(".sh") ? 0o755 : undefined,
        ),
      );
    }
    let note = "Import scripts manually in Dropover Settings → Custom Scripts";
    try {
      const manifestRaw = await readFile(join(srcDir, "manifest.json"), "utf8");
      note = formatDropoverImportNote(dest, parseDropoverManifest(manifestRaw));
    } catch {
      // build output may lack manifest when targeting a single script file
    }
    results.push({
      target,
      action: "note",
      path: note,
    });
    return results;
  }

  if (target === "shortcuts-cherri") {
    const entries = await readdir(srcDir).catch(() => []);
    for (const name of entries) {
      if (!name.endsWith(".shortcut")) continue;
      const path = join(srcDir, name);
      results.push({
        target,
        action: write ? "open for import" : "would open for import",
        path,
      });
      if (write) {
        await new Promise<void>((resolve, reject) => {
          spawn("open", [path], { stdio: "inherit" })
            .on("error", reject)
            .on("close", (code) => {
              if (code === 0) resolve();
              else reject(new Error(`open exited ${code} for ${path}`));
            });
        });
      }
    }
    results.push({
      target,
      action: "note",
      path: "Re-import .shortcut once after thin-shim upgrade; body edits then live in ~/.polycast/commands/",
    });
    return results;
  }

  if (target === "agent-cli") {
    const dest = agentBinDir();
    const entries = await readdir(srcDir).catch(() => []);
    for (const name of entries) {
      if (name.endsWith(".polycast-meta.json") || name.endsWith(".polycast-owned")) continue;
      const binDest = join(dest, name);
      const fileResult = await installFile(target, join(srcDir, name), binDest, write, 0o755);
      results.push(fileResult);
      const markerDest = join(dest, `${name}.polycast-owned`);
      const marker = markerResult(target, fileResult.action, markerDest, write);
      if (marker) {
        await writeMarker(markerDest, fileResult.action, write);
        results.push(marker);
      }
    }
    return results;
  }

  if (target === "raycast-snippet" || target === "raycast-quicklink") {
    results.push({
      target,
      action: "note",
      path: `Import ${join(srcDir, target === "raycast-snippet" ? "snippets.json" : "quicklinks.json")} via Raycast UI`,
    });
    return results;
  }

  return [{ target, action: "skip", path: srcDir }];
}

async function applyCommandsJson(outRoot: string, write: boolean): Promise<ApplyResult[]> {
  const src = join(outRoot, "commands");
  const dest = commandsStoreDir();
  const results: ApplyResult[] = [];
  const entries = await readdir(src).catch(() => []);
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const to = join(dest, name);
    const action = await installAllowed(to, write);
    results.push({ target: "commands-store", action, path: to });
    if (write && action === "install") {
      await mkdir(dest, { recursive: true });
      await cp(join(src, name), to, { force: true });
    }
  }
  return results;
}

/** Install root for targets that write to a persistent directory (undefined = UI import only). */
export function installDirForTarget(target: string): string | undefined {
  switch (target) {
    case "raycast-script":
      return raycastScriptDir();
    case "popclip":
      return popclipExtensionsDir();
    case "dropzone":
      return dropzoneActionsDir();
    case "dropover-script":
      return dropoverStagingDir();
    case "agent-cli":
      return agentBinDir();
    default:
      return undefined;
  }
}

export async function applyBuilt(options: ApplyOptions): Promise<ApplyResult[]> {
  const outRoot = resolve(options.outRoot);
  const selected = options.targets ?? [];
  const results: ApplyResult[] = [];

  for (const target of selected) {
    const srcDir = join(outRoot, target);
    try {
      await readdir(srcDir);
    } catch {
      results.push({ target, action: "skip", path: "(no build output)" });
      continue;
    }
    results.push(...(await applyTarget(target, srcDir, options.write)));
  }

  if (selected.some(targetNeedsCommandsStore)) {
    results.push(...(await applyCommandsJson(outRoot, options.write)));
  }

  return results;
}

export async function pruneOwned(targetDir: string, write: boolean): Promise<string[]> {
  const removed: string[] = [];
  const entries = await readdir(targetDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const p = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      const owned = join(p, OWNERSHIP_MARKER);
      try {
        await readFile(owned, "utf8");
        if (write) await rm(p, { recursive: true, force: true });
        removed.push(p);
      } catch {
        removed.push(...(await pruneOwned(p, write)));
      }
    } else if (entry.name.endsWith(".polycast-owned")) {
      if (write) await rm(p, { force: true });
      removed.push(p);
    }
  }
  return removed;
}
