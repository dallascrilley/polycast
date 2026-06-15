import { spawn } from "node:child_process";
import { basename, join } from "node:path";
import type { EmittedFile } from "./types.ts";

function cherriAvailable(): boolean {
  try {
    const r = Bun.spawnSync(["which", "cherri"], { stdout: "ignore", stderr: "ignore" });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

/** Compile .cherri files to .shortcut when cherri is available. */
export async function compileCherriArtifacts(
  targetDir: string,
  files: readonly EmittedFile[],
): Promise<void> {
  if (process.env.POLYCAST_SKIP_CHERRI === "1") {
    console.log("skip  cherri compile (POLYCAST_SKIP_CHERRI=1)");
    return;
  }

  const cherriFiles = files.filter((f) => f.path.endsWith(".cherri"));
  if (cherriFiles.length === 0) return;

  if (!cherriAvailable()) {
    console.log("skip  cherri compile (cherri not on PATH)");
    return;
  }

  for (const file of cherriFiles) {
    const src = join(targetDir, file.path);
    const cwd = join(targetDir, file.path.includes("/") ? file.path.replace(/\/[^/]+$/, "") : "");
    await new Promise<void>((resolve, reject) => {
      const child = spawn("cherri", [basename(src)], { cwd: cwd || targetDir, stdio: "inherit" });
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
  }
}
