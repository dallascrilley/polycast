# Terminal Path Link (PopClip)

When you select a repo-relative path in **iTerm2** or **Terminal.app**, copy a
markdown `file://` link resolved against that tab's working directory.

## Install

Double-click `terminal-path-link.popclipext` in Finder (PopClip shows an unsigned
extension warning for local shell packages — expected).

## Supported terminals (v1)

| App | Bundle ID |
|-----|-----------|
| iTerm2 | `com.googlecode.iterm2` |
| Terminal.app | `com.apple.Terminal` |

Other hosts (Cursor, VS Code, Warp, Ghostty) show a clear error in PopClip.

## Options

- **Markdown link** — `[selection](file://…)` (default)
- **file:// URL only** — bare URL for pasting elsewhere

## Terminal testing

```sh
export TERMINAL_PATH_LINK_CWD="/path/to/repo"
export POPCLIP_TEXT="docs/README.md"
./resolve-link.sh
```

## Validation

```sh
~/.hub/artifacts/skills/popclip-extension-development/source/adapted/scripts/validate-package.sh \
  extensions/terminal-path-link.popclipext
```
