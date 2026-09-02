import { defineCommand } from "../src/define.ts";

const AGENTS_URL = "https://dallas-macbook.tail16923a.ts.net/agents";
const TAILNET_HEALTH_URL = "https://dallas-macbook.tail16923a.ts.net:8445/health";

/**
 * One of the four WKS-1420 bounded iPhone device-fabric actions. On
 * `shortcuts-cherri` this compiles to a native `downloadURL`/`openURL`
 * workflow (see `x.shortcuts.workflow`), never the shell dispatcher: the
 * Tailscale preflight and destination are both fixed at build time, and no
 * bearer token is embedded — the PWA owns its own authenticated session.
 */
export default defineCommand({
  id: "agents",
  title: "Agents",
  description: "Open the authenticated Agents PWA over the private tailnet route.",
  icon: "🤖",
  modality: "none",
  author: "dallascrilley",
  x: {
    shortcuts: {
      name: "Agents",
      workflow: [
        { kind: "require-reachable", url: TAILNET_HEALTH_URL },
        { kind: "open-url", url: AGENTS_URL },
      ],
    },
  },
  body: {
    lang: "bash",
    source: `set -euo pipefail
url="${AGENTS_URL}"
if ! curl --fail --silent --show-error --max-time 5 --head "$url" >/dev/null; then
  echo "polycast: $url unreachable — connect Tailscale first" >&2
  exit 1
fi
if command -v open >/dev/null 2>&1; then
  open "$url"
else
  echo "polycast: no local browser opener on this host; open manually: $url" >&2
  exit 1
fi`,
  },
});
