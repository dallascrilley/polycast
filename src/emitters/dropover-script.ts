import { OWNERSHIP_MARKER, POLYCAST_VERSION } from "../constants.ts";
import { filesRunShim } from "../shim.ts";
import type { CommandDef, EmittedFile, Emitter, ValidationIssue } from "../types.ts";

export const dropoverScript: Emitter = {
  target: "dropover-script",
  supports: ["files"],

  emit(cmd: CommandDef): EmittedFile[] {
    if (!this.supports.includes(cmd.modality)) return [];

    return [
      {
        path: `${cmd.id}.sh`,
        contents: filesRunShim(cmd),
        mode: 0o755,
      },
      {
        // Markers are named after the artifact they own (`<file>.polycast-owned`)
        // so apply's ownership check and prune both resolve them.
        path: `${cmd.id}.sh${OWNERSHIP_MARKER}`,
        contents: "polycast\n",
      },
    ];
  },

  emitCatalog(commands: readonly CommandDef[]): EmittedFile[] {
    const scripts = commands.filter((c) => this.supports.includes(c.modality));
    if (scripts.length === 0) return [];

    const manifest = {
      version: 1,
      polycastVersion: POLYCAST_VERSION,
      scripts: scripts.map((cmd) => ({
        id: cmd.id,
        name: cmd.title,
        description: cmd.description,
        scriptPath: `${cmd.id}.sh`,
        instantAction: cmd.x?.dropover?.instantAction ?? false,
        polycastOwned: true,
      })),
    };

    return [
      { path: "manifest.json", contents: `${JSON.stringify(manifest, null, 2)}\n` },
      // The manifest is written wholesale by polycast on every build, so it is
      // polycast-owned: mark it to keep re-apply and prune symmetric.
      { path: `manifest.json${OWNERSHIP_MARKER}`, contents: "polycast\n" },
    ];
  },

  validate(cmd: CommandDef, files: readonly EmittedFile[]): ValidationIssue[] {
    const script = files.find((f) => f.path.endsWith(".sh"));
    if (!script) {
      return [{ target: this.target, message: "missing shell script", severity: "error" }];
    }
    if (!script.contents.startsWith("#!")) {
      return [{ target: this.target, message: "script missing shebang", severity: "error" }];
    }
    if (!script.contents.includes(" run --commands ")) {
      return [
        {
          target: this.target,
          message: "script missing polycast run dispatcher stub",
          severity: "error",
        },
      ];
    }
    return [];
  },
};
