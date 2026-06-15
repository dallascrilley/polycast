export interface DropoverManifestScript {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly scriptPath: string;
  readonly instantAction?: boolean;
  readonly polycastOwned?: boolean;
}

export interface DropoverManifest {
  readonly version: number;
  readonly polycastVersion?: string;
  readonly scripts: readonly DropoverManifestScript[];
}

export function parseDropoverManifest(raw: string): DropoverManifest {
  const parsed = JSON.parse(raw) as DropoverManifest;
  if (!parsed?.scripts?.length) {
    throw new Error("dropover manifest missing scripts array");
  }
  return parsed;
}

/** Operator-facing import steps after polycast apply stages scripts. */
export function formatDropoverImportNote(stagingDir: string, manifest: DropoverManifest): string {
  const lines = [
    `Staging dir: ${stagingDir}`,
    `Manifest: ${stagingDir}/manifest.json`,
    "",
    "Import (Dropover Pro → Settings → Custom Scripts → Add New → Shell):",
    ...manifest.scripts.map((s) => `  • ${s.name} (${s.id}): ${stagingDir}/${s.scriptPath}`),
    "",
    "Instant Actions: assign manually in Settings → Instant Actions (max 6).",
    "Safe merge: polycast never edits Dropover prefs or .item_store_instant-actions.",
  ];
  return lines.join("\n");
}
