#!/usr/bin/env bash
# Resolve selected path against terminal cwd and print a markdown or file:// link.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

trim() {
	local s="$1"
	s="${s//$'\r'}"
	s="${s//$'\n'}"
	s="${s#"${s%%[![:space:]]*}"}"
	s="${s%"${s##*[![:space:]]}"}"
	printf '%s' "$s"
}

selection="$(trim "${POPCLIP_TEXT:-}")"
display_selection="$selection"

if [[ -z "$selection" ]]; then
	echo "No text selection" >&2
	exit 1
fi

# Compiler / tool output often appends :line
if [[ "$selection" =~ ^(.+):[0-9]+$ ]]; then
	selection="${BASH_REMATCH[1]}"
	display_selection="$selection"
fi

resolve_absolute() {
	local target="$1"
	if command -v realpath >/dev/null 2>&1; then
		realpath "$target"
	else
		python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$target"
	fi
}

resolved=""
if [[ "$selection" = /* ]]; then
	if [[ ! -e "$selection" ]]; then
		echo "Path does not exist: $selection" >&2
		exit 1
	fi
	resolved="$(resolve_absolute "$selection")"
else
	cwd=""
	if ! cwd="$("$SCRIPT_DIR/get-terminal-cwd.sh")"; then
		exit 1
	fi
	joined="$cwd/$selection"
	if [[ "$selection" = ./* ]]; then
		joined="$cwd/${selection#./}"
	fi
	if [[ ! -e "$joined" ]]; then
		echo "Path does not exist: $joined" >&2
		exit 1
	fi
	resolved="$(resolve_absolute "$joined")"
fi

link_format="${POPCLIP_OPTION_LINK_FORMAT:-markdown}"
file_url="$(python3 -c 'import sys, urllib.parse; print("file://" + urllib.parse.quote(sys.argv[1], safe="/:"))' "$resolved")"

case "$link_format" in
	file_url)
		printf '%s\n' "$file_url"
		;;
	markdown|*)
		printf '[%s](%s)\n' "$display_selection" "$file_url"
		;;
esac
