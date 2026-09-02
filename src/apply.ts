import { spawn } from "node:child_process";
import { access, chmod, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { OWNERSHIP_MARKER } from "./constants.ts";
import { formatDropoverImportNote, parseDropoverManifest } from "./dropover-manifest.ts";
import { targetNeedsCommandsStore } from "./shim.ts";

export type ShortcutOpener = (path: string) => Promise<void>;

/**
 * Importing a compiled Shortcut is the only apply operation that opens a UI.
 * Keep operator consent separate from the write switch so normal writes can
 * never import into the live Shortcuts library by accident.
 */
export type ShortcutImportConsent =
  | { readonly kind: "none" }
  | { readonly kind: "operator-approved"; readonly opener: ShortcutOpener };

export interface ApplyOptions {
  readonly outRoot: string;
  readonly write: boolean;
  readonly targets?: readonly string[];
  readonly shortcutImport?: ShortcutImportConsent;
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

// Raycast has no fixed script-commands location; the user registers folders in
// Settings. Default to a polycast-owned dir and let POLYCAST_RAYCAST_DIR point
// at an existing enabled folder instead.
function raycastScriptDir(): string {
  return expandHome(process.env.POLYCAST_RAYCAST_DIR ?? "~/.polycast/raycast");
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

function openShortcutForImport(path: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    spawn("open", [path], { stdio: "inherit" })
      .on("error", reject)
      .on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`open exited ${code} for ${path}`));
      });
  });
}

/** Build the explicit CLI-only consent state for importing Shortcuts.app files. */
export function operatorApprovedShortcutImport(): ShortcutImportConsent {
  return { kind: "operator-approved", opener: openShortcutForImport };
}

function shortcutImportAction(consent: ShortcutImportConsent, write: boolean): string {
  switch (consent.kind) {
    case "none":
      return write ? "skip import" : "would skip import";
    case "operator-approved":
      return write ? "open for import" : "would open for import";
    default: {
      const _exhaustive: never = consent;
      return _exhaustive;
    }
  }
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
  if (await pathExists(`${dest}${OWNERSHIP_MARKER}`)) return true;
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

async function applyTarget(
  target: string,
  srcDir: string,
  write: boolean,
  shortcutImport: ShortcutImportConsent,
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];

  if (target === "raycast-script") {
    const dest = raycastScriptDir();
    const entries = await readdir(srcDir).catch(() => []);
    for (const name of entries) {
      if (!name.endsWith(".sh")) continue;
      const scriptDest = join(dest, name);
      const fileResult = await installFile(target, join(srcDir, name), scriptDest, write, 0o755);
      results.push(fileResult);
      const markerDest = join(dest, `${name}${OWNERSHIP_MARKER}`);
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
      // Markers are written per installed artifact below, not copied as files.
      if (name.endsWith(OWNERSHIP_MARKER)) continue;
      if (!name.endsWith(".sh") && name !== "manifest.json") continue;
      const fileResult = await installFile(
        target,
        join(srcDir, name),
        join(dest, name),
        write,
        name.endsWith(".sh") ? 0o755 : undefined,
      );
      results.push(fileResult);
      const markerDest = join(dest, `${name}${OWNERSHIP_MARKER}`);
      const marker = markerResult(target, fileResult.action, markerDest, write);
      if (marker) {
        await writeMarker(markerDest, fileResult.action, write);
        results.push(marker);
      }
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
        action: shortcutImportAction(shortcutImport, write),
        path,
      });
      if (write && shortcutImport.kind === "operator-approved") {
        await shortcutImport.opener(path);
      }
    }
    results.push({
      target,
      action: "note",
      path:
        shortcutImport.kind === "operator-approved"
          ? "Re-import .shortcut once after thin-shim upgrade; body edits then live in ~/.polycast/commands/"
          : "Shortcut import skipped by default; pass --write --import-shortcuts for explicit operator-approved import. Re-import .shortcut once after thin-shim upgrade; body edits live in ~/.polycast/commands/",
    });
    return results;
  }

  if (target === "shortcuts-remote-ssh") {
    results.push({
      target,
      action: "note",
      path: "Transfer the compiled .shortcut to the intended iPhone or iPad. It is credential-bearing build output; do not import it into the Mac's local Shortcuts library.",
    });
    return results;
  }

  if (target === "termux-shortcut") {
    results.push({
      target,
      action: "note",
      path: "Copy the generated .sh file to the tablet's Termux:Widget shortcut directory. The script reuses mac-exec and does not install SSH configuration.",
    });
    return results;
  }

  if (target === "agent-cli") {
    const dest = agentBinDir();
    const entries = await readdir(srcDir).catch(() => []);
    for (const name of entries) {
      if (name.endsWith(".polycast-meta.json") || name.endsWith(OWNERSHIP_MARKER)) continue;
      const binDest = join(dest, name);
      const fileResult = await installFile(target, join(srcDir, name), binDest, write, 0o755);
      results.push(fileResult);
      const markerDest = join(dest, `${name}${OWNERSHIP_MARKER}`);
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
    // Without a marker the store would be unownable: the next apply --write
    // would refuse its own files, and prune would leave them behind.
    const markerDest = `${to}${OWNERSHIP_MARKER}`;
    const marker = markerResult("commands-store", action, markerDest, write);
    if (marker) {
      await writeMarker(markerDest, action, write);
      results.push(marker);
    }
  }
  return results;
}

/** Install root for the JSON command store (bodies shared by every surface). */
export function commandsStoreInstallDir(): string {
  return commandsStoreDir();
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
  const shortcutImport: ShortcutImportConsent = options.shortcutImport ?? { kind: "none" };
  const results: ApplyResult[] = [];

  for (const target of selected) {
    const srcDir = join(outRoot, target);
    try {
      await readdir(srcDir);
    } catch {
      results.push({ target, action: "skip", path: "(no build output — nothing to install)" });
      continue;
    }
    results.push(...(await applyTarget(target, srcDir, options.write, shortcutImport)));
  }

  if (selected.some(targetNeedsCommandsStore)) {
    results.push(...(await applyCommandsJson(outRoot, options.write)));
  }

  return results;
}

/**
 * Remove every polycast-written path under `targetDir`.
 *
 * Two ownership shapes exist and both must take the artifact with them:
 * a directory holding a bare `.polycast-owned` marker (PopClip/Dropzone
 * bundles), and a sidecar `<artifact>.polycast-owned` file next to the
 * artifact it names (Raycast scripts, agent-cli stubs, Dropover scripts and
 * their shared manifest.json).
 */
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
    } else if (entry.name === OWNERSHIP_MARKER) {
      // A bare marker at the top of an install dir owns that dir's contents,
      // not the dir itself — drop the marker only.
      if (write) await rm(p, { force: true });
      removed.push(p);
    } else if (entry.name.endsWith(OWNERSHIP_MARKER)) {
      // Sidecar marker: remove the artifact it names first, so an interrupted
      // prune leaves the marker behind and stays re-runnable.
      const artifact = p.slice(0, -OWNERSHIP_MARKER.length);
      if (await pathExists(artifact)) {
        if (write) await rm(artifact, { recursive: true, force: true });
        removed.push(artifact);
      }
      if (write) await rm(p, { force: true });
      removed.push(p);
    }
  }
  return removed;
}
