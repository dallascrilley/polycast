import { defineCommand } from "../src/define.ts";

const REVIEWS_URL = "https://dallas-macbook.tail16923a.ts.net/reviews";
const TAILNET_HEALTH_URL = "https://dallas-macbook.tail16923a.ts.net:8445/health";

/**
 * One of the four WKS-1420 bounded iPhone device-fabric actions. See
 * `agents.ts` for the shared native-workflow rationale.
 */
export default defineCommand({
  id: "reviews",
  title: "Reviews",
  description: "Open the authenticated Reviews PWA over the private tailnet route.",
  icon: "🔍",
  modality: "none",
  author: "dallascrilley",
  x: {
    shortcuts: {
      name: "Reviews",
      workflow: [
        { kind: "require-reachable", url: TAILNET_HEALTH_URL },
        { kind: "open-url", url: REVIEWS_URL },
      ],
    },
  },
  body: {
    lang: "bash",
    source: `set -euo pipefail
url="${REVIEWS_URL}"
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
