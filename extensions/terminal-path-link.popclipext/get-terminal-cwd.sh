#!/usr/bin/env bash
# Return absolute cwd for the frontmost supported terminal tab.
set -euo pipefail

SCRIPT_DIR="$(dirname "$(realpath "${BASH_SOURCE[0]}")")"

if [[ -n "${TERMINAL_PATH_LINK_CWD:-}" ]]; then
	printf '%s\n' "$TERMINAL_PATH_LINK_CWD"
	exit 0
fi

bundle="${POPCLIP_BUNDLE_IDENTIFIER:-}"
app_name="${POPCLIP_APP_NAME:-unknown}"

case "$bundle" in
	com.googlecode.iterm2)
		osascript "$SCRIPT_DIR/lib/iterm2-cwd.applescript"
		exit 0
		;;
	com.apple.Terminal)
		tty_name="$(osascript "$SCRIPT_DIR/lib/terminal-app-cwd.applescript")"
		tty_path="/dev/$tty_name"
		if [[ ! -e "$tty_path" ]]; then
			echo "Terminal tty not found: $tty_path" >&2
			exit 1
		fi
		pid="$(ps -t "$tty_path" -o pid= -o comm= | awk 'NF && $2 !~ /^(login|ps)$/ { print $1; exit }')"
		if [[ -z "${pid:-}" ]]; then
			echo "Could not find shell process for Terminal tty $tty_name" >&2
			exit 1
		fi
		cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ { sub(/^n/, ""); print; exit }')"
		if [[ -z "${cwd:-}" ]]; then
			echo "Could not read cwd for Terminal shell pid $pid" >&2
			exit 1
		fi
		printf '%s\n' "$cwd"
		exit 0
		;;
	*)
		echo "Terminal path link requires iTerm2 or Terminal.app (frontmost: ${app_name}, bundle: ${bundle:-unset})." >&2
		echo "Supported: com.googlecode.iterm2, com.apple.Terminal" >&2
		exit 2
		;;
esac
