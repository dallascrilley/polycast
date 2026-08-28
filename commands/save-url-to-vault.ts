import { defineCommand } from "../src/define.ts";

/** Save a shared web page as Markdown on the Dallas MacBook Pro. */
export default defineCommand({
  id: "save-url-to-vault",
  title: "Save URL to Vault",
  description: "Convert a web page to Markdown and save it in the vault inbox.",
  icon: "📥",
  modality: "text",
  author: "dallascrilley",
  x: {
    shortcuts: {
      name: "Save URL to Vault",
      from: "sharesheet",
      inputs: ["url", "webpage", "text"],
    },
  },
  body: {
    lang: "bash",
    source: `set -euo pipefail

url="$(cat)"
url="\${url#"\${url%%[![:space:]]*}"}"
url="\${url%"\${url##*[![:space:]]}"}"

case "$url" in
  http://*|https://*) ;;
  *)
    printf 'Save URL to Vault needs an http or https URL.\\n' >&2
    exit 64
    ;;
esac

url_base64="$(printf '%s' "$url" | base64 | tr -d '\\n')"

exec ssh \\
  -o Hostname=dallas-macbook.tail16923a.ts.net \\
  -o BatchMode=yes \\
  -o ConnectTimeout=10 \\
  -o ServerAliveInterval=15 \\
  -o ServerAliveCountMax=2 \\
  dallas \\
  bash -s -- "$url_base64" <<'POLYCAST_REMOTE'
set -euo pipefail

url="$(printf '%s' "$1" | base64 --decode)"
destination="$HOME/vault/inbox/auto"
mkdir -p "$destination"

html_file="$(mktemp "\${TMPDIR:-/tmp}/save-url-to-vault.html.XXXXXX")"
markdown_file="$(mktemp "\${TMPDIR:-/tmp}/save-url-to-vault.md.XXXXXX")"
trap 'rm -f "$html_file" "$markdown_file"' EXIT

curl \\
  --fail \\
  --location \\
  --silent \\
  --show-error \\
  --compressed \\
  --max-time 90 \\
  --max-filesize 10485760 \\
  --user-agent 'Mozilla/5.0 (Macintosh; Apple Silicon Mac OS X) Polycast/0.1' \\
  "$url" > "$html_file"

title="$(python3 - "$html_file" <<'PYTHON'
from html.parser import HTMLParser
from pathlib import Path
import sys


class TitleParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_title = False
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "title":
            self.in_title = True

    def handle_endtag(self, tag):
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.parts.append(data)


parser = TitleParser()
parser.feed(Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace"))
print(" ".join(" ".join(parser.parts).split()))
PYTHON
)"

if [ -z "$title" ]; then
  title="$(printf '%s' "$url" | sed -E 's#^https?://##; s#[/?#].*$##')"
fi
if [ -z "$title" ]; then
  title="Web page"
fi

slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^[:alnum:]]+/-/g; s/^-+//; s/-+$//' | cut -c1-80)"
if [ -z "$slug" ]; then
  slug="web-page"
fi

pandoc --from=html --to=gfm-raw_html --wrap=none "$html_file" > "$markdown_file"

staging="$(mktemp "$destination/.save-url-to-vault.XXXXXX")"
trap 'rm -f "$html_file" "$markdown_file" "$staging"' EXIT
{
  printf 'Source: %s\\n\\n' "$url"
  printf 'Saved: %s\\n\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat "$markdown_file"
  printf '\\n'
} > "$staging"

base="$destination/$(date +%Y-%m-%d)-$slug"
path="$base.md"
suffix=2
while ! ln "$staging" "$path" 2>/dev/null; do
  if [ ! -e "$path" ]; then
    printf 'Could not reserve a vault note path: %s\\n' "$path" >&2
    exit 1
  fi
  path="$base-$suffix.md"
  suffix=$((suffix + 1))
done
rm -f "$staging"

printf 'Saved %s\\n' "$path"
POLYCAST_REMOTE`,
  },
});
