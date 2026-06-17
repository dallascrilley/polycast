# Terminal path link PopClip — verification

**Date:** 2026-06-15
**Feature:** `extensions/terminal-path-link.popclipext`
**Plan:** [2026-06-15-feat-terminal-path-link-popclip-plan.md](../plans/2026-06-15-feat-terminal-path-link-popclip-plan.md)
**Proof level:** B (shell contract) + A (PopClip UI in supported terminal)

Standalone PopClip extension — not wired through polycast `apply`. Resolves a
selected repo-relative path against iTerm2 or Terminal.app cwd and copies a
markdown `file://` link.

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| macOS with PopClip | Setapp or [popclip.app](https://www.popclip.app/) |
| iTerm2 **or** Terminal.app | v1 supported hosts only |
| polycast repo cloned | for shell tests and example paths |

## Install

```sh
open extensions/terminal-path-link.popclipext
# or: double-click in Finder — expect unsigned shell extension warning (expected)
```

Validate package:

```sh
~/.hub/artifacts/skills/popclip-extension-development/source/adapted/scripts/validate-package.sh \
  extensions/terminal-path-link.popclipext
# expect: VALID
```

## Level B — shell contract

Automated: `bun test test/terminal-path-link.test.ts`

Manual spot-check from repo root:

```sh
TERMINAL_PATH_LINK_CWD="$PWD" POPCLIP_TEXT=docs/agent-native/capability-map.md \
  extensions/terminal-path-link.popclipext/resolve-link.sh
```

**Example output (2026-06-15):**

```text
[docs/agent-native/capability-map.md](file:///Users/dallascrilley/Code/polycast/docs/agent-native/capability-map.md)
```

Unsupported host (e.g. Cursor frontmost):

```sh
POPCLIP_BUNDLE_IDENTIFIER=com.todesktop.230313mzl4w4u92 POPCLIP_APP_NAME=Cursor \
  extensions/terminal-path-link.popclipext/get-terminal-cwd.sh
# expect: exit 2, stderr lists iTerm2 / Terminal.app
```

| Check | Result | Notes |
|-------|--------|-------|
| `validate-package.sh` → VALID | ☑ PASS | CI via `test/terminal-path-link.test.ts` + local run |
| Relative path + cwd override | ☑ PASS | `bun test` + example above |
| Absolute `/etc/hosts` | ☑ PASS | `bun test` |
| Missing path → exit 1 | ☑ PASS | `bun test` |
| Unsupported bundle → exit 2 | ☑ PASS | `bun test` |
| `file_url` option | ☑ PASS | `bun test` |

## Level A — PopClip UI (operator)

1. Install extension (`open extensions/terminal-path-link.popclipext`).
2. Open **iTerm2** (or Terminal.app) at polycast repo root (`cd` to repo).
3. Select path text in the terminal, e.g. `docs/agent-native/capability-map.md`.
4. PopClip → **Copy file link**.
5. Paste into Notes or a markdown doc — link should open the file in the editor/Finder.

| Step | Result | Notes |
|------|--------|-------|
| Extension visible for path-like selection | ☐ pending | operator |
| iTerm2 cwd resolve + copy | ☐ pending | operator |
| Terminal.app cwd resolve + copy | ☐ pending | operator |
| Unsupported app shows PopClip error | ☐ pending | select path in Cursor → clear error |

## Failure modes

| Scenario | Expected |
|----------|----------|
| Path does not exist under cwd | Script exit 1; stderr `Path does not exist` |
| Frontmost app not iTerm2/Terminal | `get-terminal-cwd.sh` exit 2; stderr lists supported terminals |
| Arbitrary text selection | Action hidden (regex filter) |

## Conclusion

| Proof | Status |
|-------|--------|
| B — shell / automated tests | validated — `test/terminal-path-link.test.ts` |
| A — PopClip UI in terminal | pending operator sign-off |

## References

- [PopClip + Raycast UI pattern](./2026-06-15-popclip-raycast-ui.md)
- [Level A combined session](./level-a-dogfood.md)
- Extension README: `extensions/terminal-path-link.popclipext/README.md`
