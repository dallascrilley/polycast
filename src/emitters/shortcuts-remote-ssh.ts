import { OWNERSHIP_MARKER } from "../constants.ts";
import { REMOTE_PROTOCOL_VERSION } from "../remote.ts";
import { loadRemoteSshProfile } from "../remote-profiles.ts";
import type { CommandDef, EmittedFile, Emitter, ValidationIssue } from "../types.ts";
import { escapeCherriString } from "../wrappers.ts";

function cherriDefineValue(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function remoteShortcutName(cmd: CommandDef): string {
  return cherriDefineValue(`${cmd.x?.shortcuts?.name ?? cmd.title} Remote`);
}

function remoteInput(cmd: CommandDef): string {
  return cmd.modality === "text" ? "ShortcutInput" : "nil";
}

function canEmitRemoteShortcut(cmd: CommandDef): boolean {
  return (cmd.modality === "text" || cmd.modality === "none") && Boolean(cmd.x?.remote);
}

export const shortcutsRemoteSsh: Emitter = {
  target: "shortcuts-remote-ssh",
  supports: ["text", "none"],

  canEmit: canEmitRemoteShortcut,

  emit(cmd: CommandDef): EmittedFile[] {
    if (!canEmitRemoteShortcut(cmd) || !cmd.x?.remote) return [];

    const profile = loadRemoteSshProfile(cmd.x.remote.profile);
    const lines = [`#define name ${remoteShortcutName(cmd)}`];
    // Do not interpolate general Cherri presentation directives from
    // CommandDef into this source.
    if (cmd.modality === "text") lines.push("#define inputs text");
    lines.push("#include 'actions/network'");
    // Shortcuts generates and stores its SSH key on the device. Cherri's last
    // argument maps to WFSSHPassword and cannot import a PEM identity.
    lines.push(
      `runSSHScript('polycast-remote --command ${cmd.id} --protocol ${REMOTE_PROTOCOL_VERSION}', ${remoteInput(cmd)}, '${escapeCherriString(profile.host)}', '${profile.port}', '${escapeCherriString(profile.user)}', 'SSH Key', '')`,
      "",
    );
    return [
      { path: `${cmd.id}.cherri`, contents: lines.join("\n") },
      { path: `${cmd.id}.cherri${OWNERSHIP_MARKER}`, contents: "polycast\n" },
    ];
  },

  validate(cmd: CommandDef, files: readonly EmittedFile[]): ValidationIssue[] {
    const cherri = files.find((file) => file.path.endsWith(".cherri"));
    if (!cherri)
      return [{ target: this.target, message: "missing .cherri file", severity: "error" }];
    const issues: ValidationIssue[] = [];
    if (!cherri.contents.includes("#include 'actions/network'")) {
      issues.push({
        target: this.target,
        message: "missing Cherri network actions",
        severity: "error",
      });
    }
    if (
      !cherri.contents.includes(
        `polycast-remote --command ${cmd.id} --protocol ${REMOTE_PROTOCOL_VERSION}`,
      )
    ) {
      issues.push({
        target: this.target,
        message: "missing fixed remote protocol command",
        severity: "error",
      });
    }
    if (
      cherri.contents.includes(cmd.body.lang === "exec" ? cmd.body.executable : cmd.body.source)
    ) {
      issues.push({
        target: this.target,
        message: "remote shortcut must not embed command body",
        severity: "error",
      });
    }
    return issues;
  },
};
