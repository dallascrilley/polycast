import packageMetadata from "../package.json" with { type: "json" };

/** Default metadata for bundle headers (Dropzone, etc.). */
export const POLYCAST_CREATOR = "polycast";
export const POLYCAST_URL = "https://github.com/dallascrilley/polycast";

export const OWNERSHIP_MARKER = ".polycast-owned";

/** The package manifest is the single version authority for runtime metadata. */
export const POLYCAST_VERSION = packageMetadata.version;
