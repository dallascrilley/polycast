import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";

const profileNameSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const remoteProfileSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65_535),
  user: z.string().min(1),
  transport: z.object({
    kind: z.literal("ssh-key"),
  }),
});

const remoteProfilesSchema = z.object({
  version: z.literal(1),
  profiles: z.record(profileNameSchema, remoteProfileSchema),
});

export type RemoteSshProfile = z.infer<typeof remoteProfileSchema>;

function defaultProfilesPath(): string {
  const configured = process.env.POLYCAST_REMOTE_PROFILES;
  if (configured) return resolve(configured);
  return join(homedir(), ".config", "polycast", "remote-profiles.json");
}

/** Load one private build-time profile. Command definitions never contain these fields. */
export function loadRemoteSshProfile(profileName: string): RemoteSshProfile {
  const profilesPath = defaultProfilesPath();
  const config = remoteProfilesSchema.parse(JSON.parse(readFileSync(profilesPath, "utf8")));
  const profile = config.profiles[profileName];
  if (!profile) throw new Error(`remote profile not found: ${profileName}`);
  return profile;
}
