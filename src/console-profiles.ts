import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { MissingPrivateConfig } from "./private-config.ts";

const profileNameSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const consoleProfileSchema = z.object({
  /**
   * Blink Shell's own "URL Key" from its on-device X-Callback-URL settings.
   * It authorizes local inter-app automation (this Shortcut may tell Blink to
   * run a fixed command) and grants no remote access by itself — Blink's
   * saved Hosts entry still owns the actual SSH/mosh credential.
   */
  blinkKey: z.string().min(1),
  /** Alias of a host already saved in Blink's own Hosts configuration on-device. */
  hostAlias: z.string().min(1),
});

const consoleProfilesSchema = z.object({
  version: z.literal(1),
  profiles: z.record(profileNameSchema, consoleProfileSchema),
});

export type ConsoleProfile = z.infer<typeof consoleProfileSchema>;

function defaultProfilesPath(): string {
  const configured = process.env.POLYCAST_CONSOLE_PROFILES;
  if (configured) return resolve(configured);
  return join(homedir(), ".config", "polycast", "console-profiles.json");
}

/**
 * Load one private build-time Blink Shell console profile. Command
 * definitions never contain these fields. Throws `MissingPrivateConfig` when
 * the profile file or the named profile does not exist yet (skip, don't
 * crash the build); any other error (malformed JSON, schema violation)
 * propagates normally.
 */
export function loadConsoleProfile(profileName: string): ConsoleProfile {
  const profilesPath = defaultProfilesPath();
  let raw: string;
  try {
    raw = readFileSync(profilesPath, "utf8");
  } catch {
    throw new MissingPrivateConfig(`console profiles file not found: ${profilesPath}`);
  }
  const config = consoleProfilesSchema.parse(JSON.parse(raw));
  const profile = config.profiles[profileName];
  if (!profile) {
    throw new MissingPrivateConfig(`console profile not found: ${profileName}`);
  }
  return profile;
}
