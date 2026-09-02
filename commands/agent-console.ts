import { defineCommand } from "../src/define.ts";

const TAILNET_HEALTH_URL = "https://dallas-macbook.tail16923a.ts.net:8445/health";

/**
 * One of the four WKS-1420 bounded iPhone device-fabric actions.
 *
 * On `shortcuts-cherri` this opens Blink Shell's documented X-Callback-URL
 * (`blinkshell://run?key=...&cmd=mosh <alias>`) against a host already saved
 * in Blink's own on-device Hosts configuration — see `open-console` in
 * `types.ts`. It never accepts shared text as a command: `mosh <alias>` is
 * fixed at build time from the named `ConsoleProfile`. Deliberately excluded
 * from `x.remote`: polycast's own SSH dispatcher is not this action's route,
 * per the WKS-1546 constraint that Agent Console invokes only the saved
 * mosh/SSH profile.
 *
 * The universal local script below attaches the same canonical
 * `tmux -L agents` session directly; it has no remote counterpart in
 * polycast because the remote route belongs entirely to Blink/mosh.
 */
export default defineCommand({
  id: "agent-console",
  title: "Agent Console",
  description: "Attach the canonical `tmux -L agents` session, locally or via Blink Shell.",
  icon: "🖥️",
  modality: "none",
  author: "dallascrilley",
  x: {
    shortcuts: {
      name: "Agent Console",
      workflow: [
        { kind: "require-reachable", url: TAILNET_HEALTH_URL },
        { kind: "open-console", profile: "dallas-macbook" },
      ],
    },
  },
  body: {
    lang: "bash",
    source: `set -euo pipefail
if ! command -v tmux >/dev/null 2>&1; then
  echo "polycast: tmux not found on this host" >&2
  exit 1
fi
if [ ! -t 0 ]; then
  echo "polycast: agent-console needs an interactive terminal to attach tmux" >&2
  exit 1
fi
tmux -L agents attach || tmux -L agents new-session`,
  },
});
