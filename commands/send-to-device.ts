import { defineCommand } from "../src/define.ts";

const TAILNET_HEALTH_URL = "https://dallas-macbook.tail16923a.ts.net:8445/health";

/**
 * One of the four WKS-1420 bounded iPhone device-fabric actions.
 *
 * On `shortcuts-cherri` this delegates to Tailscale's own native Send
 * File/Taildrop Shortcuts action via a `native-capture` workflow step — see
 * `types.ts`. Apple does not publish third-party App Intent identifiers and
 * Cherri's standard library has no built-in wrapper for one, so this
 * requires exactly one human capture step before it builds; see
 * docs/guides/native-action-capture.md. That native action always prompts
 * for an explicit destination device itself; Polycast never selects one.
 *
 * The universal local script below is the equivalent CLI entry point and
 * enforces the same explicit-destination rule: it never silently picks a
 * device.
 */
export default defineCommand({
  id: "send-to-device",
  title: "Send to Device",
  description: "Send file(s) to an explicit Tailscale peer via Taildrop.",
  icon: "📤",
  modality: "files",
  author: "dallascrilley",
  x: {
    shortcuts: {
      name: "Send to Device",
      from: "sharesheet",
      inputs: ["file", "image"],
      workflow: [
        { kind: "require-reachable", url: TAILNET_HEALTH_URL },
        { kind: "native-capture", capture: "tailscale-send-file" },
      ],
    },
  },
  body: {
    lang: "bash",
    source: `set -euo pipefail
if ! command -v tailscale >/dev/null 2>&1; then
  echo "polycast: tailscale CLI not found — install/connect Tailscale first" >&2
  exit 1
fi
if [ "$#" -eq 0 ]; then
  echo "polycast: send-to-device requires at least one file path" >&2
  exit 1
fi
target="\${POLYCAST_SEND_TO_DEVICE_TARGET:-}"
if [ -z "$target" ]; then
  if [ -t 0 ]; then
    tailscale file cp --targets
    read -r -p "Destination device (exact name from the list above): " target
  else
    echo "polycast: no destination device selected — set POLYCAST_SEND_TO_DEVICE_TARGET or run interactively" >&2
    exit 1
  fi
fi
if [ -z "$target" ]; then
  echo "polycast: no destination device selected" >&2
  exit 1
fi
tailscale file cp "$@" "\${target}:"`,
  },
});
