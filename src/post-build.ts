import { spawn } from "node:child_process";
import { readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { OWNERSHIP_MARKER } from "./constants.ts";
import type { EmittedFile } from "./types.ts";

/** Whether this host can run optional Cherri compilation. */
export function cherriAvailable(): boolean {
  try {
    const r = Bun.spawnSync(["which", "cherri"], { stdout: "ignore", stderr: "ignore" });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Compile .cherri files to .shortcut when cherri is available.
 *
 * Returns every path this wrote, relative to `targetDir`, so the build summary
 * can count the compiled `.shortcut` files and their ownership markers. They
 * are build output the emitter itself never sees.
 */
export async function compileCherriArtifacts(
  targetDir: string,
  files: readonly EmittedFile[],
): Promise<string[]> {
  if (process.env.POLYCAST_SKIP_CHERRI === "1") {
    console.log("skip  cherri compile (POLYCAST_SKIP_CHERRI=1)");
    return [];
  }

  const cherriFiles = files.filter((f) => f.path.endsWith(".cherri"));
  if (cherriFiles.length === 0) return [];

  if (!cherriAvailable()) {
    console.log("skip  cherri compile (cherri not on PATH)");
    return [];
  }

  const written: string[] = [];
  for (const file of cherriFiles) {
    const src = join(targetDir, file.path);
    const cwd = join(targetDir, file.path.includes("/") ? file.path.replace(/\/[^/]+$/, "") : "");
    const workDir = cwd || targetDir;
    // Without -o, cherri names the output after `#define name`, which is not a
    // path polycast can predict or mark as owned. Pin it to <source>.shortcut.
    const outName = `${basename(src).replace(/\.cherri$/, "")}.shortcut`;
    const before = new Set(await readdir(workDir).catch(() => []));
    await new Promise<void>((resolve, reject) => {
      const child = spawn("cherri", [basename(src), `-o=./${outName}`], {
        cwd: workDir,
        stdio: "inherit",
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          console.log(`compile  cherri ${file.path}`);
          resolve();
        } else {
          reject(new Error(`cherri exited ${code} for ${file.path}`));
        }
      });
    });
    // With -o, cherri leaves its pre-signing intermediate behind under the
    // shortcut's own name (`<name>_unsigned.shortcut`). Drop the ones this
    // compile created so the target dir holds only owned artifacts.
    for (const name of await readdir(workDir).catch(() => [])) {
      if (!before.has(name) && name.endsWith("_unsigned.shortcut") && name !== outName) {
        await rm(join(workDir, name), { force: true });
      }
    }
    await writeFile(join(workDir, `${outName}${OWNERSHIP_MARKER}`), "polycast\n");
    // Report paths the same way emitted files are reported: relative to the
    // target directory, so a nested .cherri source keeps its subdirectory.
    const prefix = file.path.includes("/") ? `${file.path.replace(/\/[^/]+$/, "")}/` : "";
    written.push(`${prefix}${outName}`, `${prefix}${outName}${OWNERSHIP_MARKER}`);
  }
  return written;
}
