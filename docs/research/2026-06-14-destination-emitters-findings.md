# Destination emitters — research findings

**Date:** 2026-06-14
**Plan:** [docs/plans/2026-06-14-feat-destination-emitters-plan.md](../plans/2026-06-14-feat-destination-emitters-plan.md)
**td epic:** `td-34aff0`
**Specs index:** [docs/specs/destination-mapping.md](../specs/destination-mapping.md)

Consolidated research from platform spec audit, hub skills (`cherri-language`, `dropover-actions`, `forge`), local Dropover container inspection, and implementation on branch `docs/ci-paths-filter-permission`.

---

## Executive summary

polycast is a **transcompiler**: one `CommandDef` (metadata + body + modality) renders to eight macOS launcher surfaces. Research confirmed:

1. **Raycast** — `# @raycast.*` header is the richest dialect; Mintlify docs 410; use GitHub `raycast/script-commands` + manual.
2. **PopClip** — prefer native `stdin: text` on shell script actions over `POPCLIP_TEXT` pipe wrappers.
3. **Dropzone** — `.dzbundle/action.rb` + `run.sh`; Ruby `system(script, *items)`.
4. **Dropover** — Custom Scripts only (`"$@"`); storage **opaque** in sandbox; apply = staging + manual import.
5. **Shortcuts** — no authoring CLI; **Cherri** compiles `.cherri` → signed `.shortcut` at build time.
6. **Forge** — single-tool lifecycle; polycast owns multi-target `apply`; agent-cli output is forge-wrap compatible.

All eight emitters, validation (`build --strict`), and `apply` (dry-run / `--write`) are implemented. See verification below.

---

## Hub skill research

### Cherri (`/library load cherri-language`)

| Finding | polycast impact |
|---------|-----------------|
| `cherri file.cherri` → signed `.shortcut` on macOS | Replaced raw plist / `shortcuts sign` stub |
| `#include 'actions/mac'` + `runShellScript(body, ShortcutInput, '/bin/bash')` | `shortcuts-cherri` emitter template |
| `#define inputs text`, `#define from sharesheet`, glyph/color | Mapped via `x.shortcuts` hints |
| `POLYCAST_SKIP_CHERRI=1` / missing binary | CI skips compile; emits `.cherri` only |
| Complex workflows | Agents use Cherri directly; polycast handles body-only text/none |

**Decision:** compile at build when `cherri` on PATH (user confirmed).

### Dropover (`/library load dropover-actions`)

| Finding | polycast impact |
|---------|-----------------|
| Custom Scripts: shell receives `"$@"` | Same files modality as Dropzone body contract |
| Custom Actions: UI-wrapped built-ins | **Out of scope** — not script emission |
| Pro required | Document in spec; no runtime check |
| No public file install API | See container research below |

**Decision:** research plist storage + attempt programmatic apply (user confirmed); fallback staging + manifest.

### Forge (`/library load forge`)

| Finding | polycast impact |
|---------|-----------------|
| Layers: script → CLI → skill → MCP | polycast is CLI codegen (correct layer) |
| `forge install --target raycast` | Do **not** duplicate for polycast-managed commands |
| `forge wrap` / `forge promote` | Optional post-step for `build/agent-cli/<id>` |
| Trifecta: terminal, `--help`, agent-callable | polycast CLI follows same bar |

---

## Dropover container research (2026-06-14)

**Environment:** Dropover 5.2.0 (`LastSeenWhatsNewVersion`), macOS 26.4, bundle `me.damir.dropover-mac`.

| Path | Finding |
|------|---------|
| `~/Library/Application Support/Dropover` | **Not present** — app is sandboxed |
| `~/Library/Containers/me.damir.dropover-mac/` | Sandbox root |
| `.../Preferences/me.damir.dropover-mac.plist` | General prefs only; **no custom script payload** on test machine |
| `.../Application Support/.item_store_instant-actions` | JSON: `[{"identifier":"dropoverLink"}, ...]` — action IDs, not script source |
| `.../Documents/.instance-*` | Subscription/cloud metadata JSON |

**Verdict:** Custom script source text is UI-managed and **not exposed as plain files** without user-defined scripts configured. polycast `apply`:

1. Stages to `Documents/.polycast-scripts/` (override: `POLYCAST_DROPOVER_SCRIPTS`)
2. Writes `manifest.json` catalog
3. Marks `.polycast-owned` sidecars
4. Prints manual import note (Settings → Custom Scripts)
5. Never edits non-polycast Dropover prefs

Full detail: [docs/specs/dropover-custom-scripts.md](../specs/dropover-custom-scripts.md).

---

## Platform spec sources

| Surface | Authoritative source | polycast spec doc |
|---------|---------------------|-------------------|
| Raycast script | [github.com/raycast/script-commands](https://github.com/raycast/script-commands) | [raycast-script-commands.md](../specs/raycast-script-commands.md) |
| Raycast snippet/quicklink | dotfiles JSON samples | [raycast-snippets-quicklinks.md](../specs/raycast-snippets-quicklinks.md) |
| PopClip | [popclip.app/dev](https://www.popclip.app/dev/) | [popclip-extensions.md](../specs/popclip-extensions.md) |
| Dropzone | [aptonic/dropzone4-actions](https://github.com/aptonic/dropzone4-actions) | [dropzone-actions.md](../specs/dropzone-actions.md) |
| Dropover | hub skill + container inspection | [dropover-custom-scripts.md](../specs/dropover-custom-scripts.md) |
| Shortcuts | Cherri + `shortcuts(1)` | [apple-shortcuts.md](../specs/apple-shortcuts.md) |
| Agent CLI | polycast + forge boundary | [agent-cli.md](../specs/agent-cli.md) |
| Cross-cutting | modality matrix | [modality-matrix.md](../specs/modality-matrix.md) |

**Raycast doc note:** `developers.raycast.com` and Mintlify URLs returned 404/410 (June 2026). Use GitHub + [manual.raycast.com/script-commands](https://manual.raycast.com/script-commands).

---

## Key technical decisions (locked)

| Topic | Decision |
|-------|----------|
| IR shape | Extended Raycast header + `x.*` hints |
| PopClip I/O | `stdin: text` in Config.json |
| Shortcuts authoring | Cherri emitter + optional build compile |
| Dropover apply | Staging + manifest; no plist merge until schema known |
| Snippet/quicklink output | One catalog JSON per target per build |
| Dropzone version | `POLYCAST_DROPZONE_ACTIONS` env (default Dropzone 5 Actions path) |
| packageName | Optional in IR |
| Validation | Per-emitter `validate`; errors fail `build` |
| Ownership | `.polycast-owned` markers; safe prune in `apply` |

---

## Implementation status (2026-06-14)

| Unit | Status | Evidence |
|------|--------|----------|
| U1 Platform specs | done | `docs/specs/*.md` (9 files incl. mapping) |
| U2 Destination mapping | done | `docs/specs/destination-mapping.md`, `docs/DESIGN.md` |
| U3 Raycast hardening | done | `src/emitters/raycast-script.ts` |
| U4 PopClip alignment | done | `src/emitters/popclip.ts` |
| U5 Dropzone emitter | done | `src/emitters/dropzone.ts` |
| U6 Snippet/quicklink | done | `src/emitters/raycast-snippet.ts`, `raycast-quicklink.ts` |
| U5b Dropover emitter | done | `src/emitters/dropover-script.ts` |
| U7 Shortcuts/Cherri | done | `src/emitters/shortcuts-cherri.ts`, `src/post-build.ts` |
| U8 Agent CLI | done | `src/emitters/agent-cli.ts` |
| U9 Validation | done | `src/validate/`, `build --strict` |
| U10 Apply | done | `src/apply.ts`, `polycast apply --write` |

**Verify:** `bun test` (16 pass), `bun run typecheck`, `POLYCAST_SKIP_CHERRI=1 bun run dev build`

---

## td tracker

**Epic:** `td-34aff0` — Destination emitters research and implementation

| td | Unit | Status |
|----|------|--------|
| `td-f3ec7d` | U1 Platform spec audit | closed |
| `td-dc83b1` | U2 Destination mapping | closed |
| `td-70f160` | U3–U6 Core emitters | closed |
| `td-5b8cb2` | U5b Dropover emitter | closed |
| `td-22186c` | U7 Shortcuts/Cherri | closed |
| `td-eb4c76` | U8 Agent CLI | closed |
| `td-2ea4f0` | U9–U10 Validate + apply | closed |
| `td-88eb8d` | F1 Dropover programmatic import | **open** (critical path) |
| `td-5b9d3a` | F2 Cherri args modality | open |
| `td-84b163` | F3 Thin-shim dispatcher | open |
| `td-635ac9` | F4 Agent-native MCP | open |

Run `td tree td-34aff0` or `td critical-path` for next work.

## Open follow-ups

| td | Item | Blocker |
|----|------|---------|
| `td-88eb8d` | F1 Dropover programmatic import | Script storage schema with user-defined scripts |
| `td-5b9d3a` | F2 Cherri `args` modality | `#question` / prompt design |
| `td-84b163` | F3 Thin-shim `polycast run <id>` | Production proof of agent-cli contract |
| `td-635ac9` | F4 Agent-native MCP authoring | Separate plan |
| — | F5 Dropover Custom Actions | UI-wrapped built-ins; different surface |

---

## Related hub skills (ce-work)

| Work | Skill |
|------|-------|
| Shortcuts/Cherri | `/library load cherri-language` |
| Dropover | `/library load dropover-actions` |
| Agent CLI / forge | `/library load forge` |
