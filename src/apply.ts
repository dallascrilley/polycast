import { spawn } from "node:child_process";
import { chmod, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { OWNERSHIP_MARKER } from "./constants.ts";

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

async function copyTree(src: string, dest: string, write: boolean): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      if (write) await mkdir(to, { recursive: true });
      results.push(...(await copyTree(from, to, write)));
    } else {
      results.push({
        target: basename(dest),
        action: write ? "install" : "would install",
        path: to,
      });
      if (write) {
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
  if (write) {
    await mkdir(parentDir(dest), { recursive: true });
    await cp(src, dest, { force: true });
    if (mode) await chmod(dest, mode);
  }
  return { target, action: write ? "install" : "would install", path: dest };
}

async function applyTarget(target: string, srcDir: string, write: boolean): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];

  if (target === "raycast-script") {
    const dest = raycastScriptDir();
    const entries = await readdir(srcDir).catch(() => []);
    for (const name of entries) {
      if (!name.endsWith(".sh")) continue;
      results.push(await installFile(target, join(srcDir, name), join(dest, name), write, 0o755));
      const markerDest = join(dest, `${name}.polycast-owned`);
      if (write) await writeFile(markerDest, "polycast\n");
      results.push({ target, action: write ? "marker" : "would marker", path: markerDest });
    }
    return results;
  }

  if (target === "popclip") {
    const dest = popclipExtensionsDir();
    const entries = await readdir(srcDir).catch(() => []);
    for (const name of entries) {
      if (!name.endsWith(".popclipext")) continue;
      results.push(...(await copyTree(join(srcDir, name), join(dest, name), write)));
    }
    return results.map((r) => ({ ...r, target }));
  }

  if (target === "dropzone") {
    const dest = dropzoneActionsDir();
    const entries = await readdir(srcDir).catch(() => []);
    for (const name of entries) {
      if (!name.endsWith(".dzbundle")) continue;
      results.push(...(await copyTree(join(srcDir, name), join(dest, name), write)));
    }
    return results.map((r) => ({ ...r, target }));
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
    results.push({
      target,
      action: "note",
      path: "Import scripts manually in Dropover Settings → Custom Scripts",
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
            .on("close", () => resolve());
        });
      }
    }
    return results;
  }

  if (target === "agent-cli") {
    const dest = agentBinDir();
    const entries = await readdir(srcDir).catch(() => []);
    for (const name of entries) {
      if (name.includes(".")) continue;
      results.push(await installFile(target, join(srcDir, name), join(dest, name), write, 0o755));
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
    } else if (entry.name.includes("polycast-owned")) {
      if (write) await rm(p, { force: true });
      removed.push(p);
    }
  }
  return removed;
}
