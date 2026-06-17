---
date: 2026-06-15
origin: direct brief (no brainstorm doc)
td_epic: td-5e7ddd
---

# Terminal path → file link (PopClip extension)

**Summary:** Ship a standalone `.popclipext` package that, when a partial repo-relative path is selected in a supported terminal, resolves it against that terminal session’s cwd and copies a markdown `file://` link to the clipboard.

**Status:** implemented — PR #32; Level A UI pending operator

**td:** td-5e7ddd (U1 td-b236ed → U2 td-294adc → U3 td-7110b3 → U4 td-165479)

## Requirements

- R1. When the user selects a path-like string (e.g. `docs/agent-native/capability-map.md`) in a **supported terminal**, the extension resolves it to an absolute filesystem path using that terminal tab’s cwd.
- R2. Output is a **link** suitable for pasting into markdown docs — default `[<selection>](file://<absolute>)` with percent-encoding; option for bare `file://` URL.
- R3. Extension appears only for plausible path selections (regex), not for arbitrary text.
- R4. Unsupported hosts (non-terminal apps, unknown terminal emulators) fail with a clear PopClip message — no silent wrong paths.
- R5. Package follows `popclip-extension-development` conventions: `Config.json`, executable shell script, `identifier`, `validate-package.sh` clean.
- R6. Manual dogfood evidence logged under `docs/verification/` (Level A — operator selects path in terminal, copies link, opens file).

## Key technical decisions

- **Standalone PopClip package, not polycast emitter** — this is host-specific cwd probing; does not map cleanly to `CommandDef` IR. Lives at `extensions/terminal-path-link.popclipext/` as reference dogfood adjacent to polycast’s PopClip work.
- **Shell + AppleScript, not JS module** — cwd discovery requires `osascript` against Terminal/iTerm2; shell orchestrates cleanly and avoids unsigned `entitlements` beyond shell/AppleScript warning.
- **No `path` requirement** — PopClip `path` only matches paths that already exist on disk; partial selections fail. Use `requirements: [text]` + ICU `regex` for path-like tokens instead; validate existence after resolve.
- **v1 terminal support: iTerm2 + Terminal.app only** — iTerm2 via `session.path` / `user.currentDirectory`; Terminal.app via `tty` + `lsof` cwd (documented SO pattern). Cursor/VS Code/Warp/Ghostty deferred — `POPCLIP_BUNDLE_IDENTIFIER` routes to explicit “unsupported terminal” error.
- **Cwd override for tests** — `TERMINAL_PATH_LINK_CWD` env var in resolve script bypasses AppleScript when set (enables CI-free shell tests).
- **Identifier:** `com.dallascrilley.terminal-path-link` — avoids `com.polycast.*` unsigned-prefix dev warning during local install.

## Implementation units

### U1. Package scaffold + selection filter

- **td:** td-b236ed
- **Goal:** Installable `.popclipext` skeleton that shows in PopClip for path-like selections (regex); terminal-host check deferred to U2/U3.
- **Requirements:** R3, R5
- **Files:**
  - `extensions/terminal-path-link.popclipext/Config.json`
  - `extensions/terminal-path-link.popclipext/README.md`
  - `extensions/terminal-path-link.popclipext/resolve-link.sh` (stub: echo not implemented; replaced in U3)
- **Approach:**
  - `identifier`: `com.dallascrilley.terminal-path-link` (avoid `com.polycast.*` unsigned-prefix dev friction)
  - `regex` matches repo-relative paths: optional `./`, segments with `/`, filename with extension (md, ts, tsx, js, json, yaml, yml, sh, py, go, rs, toml, txt, …)
  - Do not use PopClip `excluded apps` — script checks `POPCLIP_BUNDLE_IDENTIFIER` in U2 for clearer errors
  - Icon: `symbol:link`
  - `shell script file`: `resolve-link.sh`, `after: copy-result`
- **Tests:** Config parses; regex accepts `docs/agent-native/capability-map.md`, rejects `hello world`
- **Verification:** `~/.hub/.../validate-package.sh extensions/terminal-path-link.popclipext` → VALID

### U2. Terminal cwd probe

- **td:** td-294adc
- **Goal:** `get-terminal-cwd.sh` returns absolute cwd for frontmost iTerm2 or Terminal.app tab.
- **Requirements:** R1, R4
- **Files:**
  - `extensions/terminal-path-link.popclipext/get-terminal-cwd.sh`
  - `extensions/terminal-path-link.popclipext/lib/iterm2-cwd.applescript`
  - `extensions/terminal-path-link.popclipext/lib/terminal-app-cwd.applescript`
- **Approach:**
  - Read `POPCLIP_BUNDLE_IDENTIFIER` (or `POPCLIP_APP_NAME`)
  - `com.googlecode.iterm2` → iTerm2 AppleScript (`tell application "iTerm" … session.path`)
  - `com.apple.Terminal` → tty + `lsof -a -p PID -d cwd` pattern (handle spaces in paths)
  - Else → exit 2 + stderr message listing supported terminals
  - Honor `TERMINAL_PATH_LINK_CWD` override when set (testing)
- **Tests:**
  - `TERMINAL_PATH_LINK_CWD=/tmp/popclip-test POPCLIP_TEXT=foo.md ./resolve-link.sh` smoke once U3 wires cwd helper (script from U3)
  - Manual: run `get-terminal-cwd.sh` while iTerm2 frontmost in known dir → prints cwd
- **Verification:** `chmod +x` scripts; manual cwd probe in iTerm2 + Terminal.app

### U3. Path resolve + link format + main action

- **td:** td-7110b3
- **Goal:** Click action copies markdown file link for resolved absolute path.
- **Requirements:** R1, R2, R5
- **Files:**
  - `extensions/terminal-path-link.popclipext/resolve-link.sh` (main `shell script file`)
- **Approach:**
  - Trim selection; strip trailing `:line` suffix if present (compiler output)
  - If selection is absolute and exists → use as-is
  - Else join `$(get-terminal-cwd.sh)` + relative path; `cd` + `realpath` (or python `os.path.realpath`)
  - If resolved path missing → write error to stderr, exit 1; `after: show-status` surfaces failure in PopClip
  - Default output: `[${selection}](file://${encoded})` — encode spaces as `%20`
  - PopClip option `link_format`: `markdown` | `file_url` (multiple type)
  - `after: copy-result`
- **Tests:**
  - `TERMINAL_PATH_LINK_CWD=$PWD POPCLIP_TEXT=docs/agent-native/capability-map.md ./resolve-link.sh` from polycast repo root → file URL contains full path to capability-map.md
  - Absolute path `/etc/hosts` still works
  - Missing file → non-zero exit
- **Verification:** `validate-package.sh` VALID; copy link from PopClip in iTerm2 session at repo root

### U4. Dogfood + verification log

- **td:** td-165479
- **Goal:** Operator checklist proving R6 with evidence paths.
- **Requirements:** R6
- **Files:**
  - `docs/verification/2026-06-15-terminal-path-link-popclip.md`
  - optional: link from `docs/verification/level-a-dogfood.md`
- **Approach:** Follow `docs/verification/2026-06-15-popclip-raycast-ui.md` format — prerequisites, steps, expected clipboard output, failure modes (unsupported app, bad path).
- **Tests:** N/A (manual)
- **Verification:** Checklist completed with pasted example link

## Worktree & concurrency

- **worktree_slug:** `feat/terminal-path-link-popclip`
- **spine_owner:** self
- **Pre-flight:** none (`scripts/worktree-posture.sh` absent in polycast)
- **Active conflicts:** none

### Write surfaces (exclusive per parallel track)

- U1–U4: `extensions/terminal-path-link.popclipext/**`, `docs/verification/2026-06-15-terminal-path-link-popclip.md`

## Prior learnings applied

- None in `docs/solutions/` for PopClip cwd — greenfield; external research: iTerm2 `session.path`, Terminal.app `lsof`+`tty` pattern.

## Deferred / out of scope

- Cursor integrated terminal / VS Code / Warp / Ghostty cwd detection
- Polycast `CommandDef` emitter for this action (host-specific logic)
- Opening the file in Finder or editor (copy-only v1)
- Line:column → GitHub-style fragment links
- Publishing to PopClip directory / signing

## Open questions

- **Link display text (implementation-time):** default to raw selection vs basename — ship with selection text unless dogfood says otherwise.
