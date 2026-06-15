---
date: 2026-06-14
origin: ~/.dotfiles/docs/ideation/2026-06-14-unified-launcher-command-generator.md
td_epic: td-34aff0
---

# Destination emitters — platform specs, design, and full implementation

**Summary:** polycast already has the IR (`CommandDef`), modality contract, and two emitters (`raycast-script`, `popclip`). This plan first captures **current platform specs** for every target surface, then designs the cross-target mapping matrix, then implements the remaining emitters, validation, and `apply` in dependency order.

## Requirements

- R1. Document up-to-date, citeable specs for each destination/output format (Raycast script commands, Raycast snippets/quicklinks, PopClip, Dropzone, Apple Shortcuts, agent CLI).
- R2. Produce a destination design that maps `CommandDef` + `Modality` + `x.*` hints to each platform's metadata, I/O wrapper, packaging, and install location.
- R3. Implement all planned emitters with modality-aware skip behavior (return `[]` when incompatible).
- R4. Add per-target validation that fails closed before artifacts are written or applied.
- R5. Implement idempotent `apply` with polycast ownership markers and safe prune.
- R6. Preserve the transcompiler model: one body, per-surface wrappers; no duplicated logic across targets.

## Key technical decisions

- **Spec sources are authoritative in this order:** official vendor docs → vendor GitHub READMEs → operator dotfiles examples (`~/.dotfiles/raycast/`, PopClip/Dropzone on-disk bundles). Mintlify Raycast URLs currently 410; use [raycast/script-commands](https://github.com/raycast/script-commands) and [manual.raycast.com/script-commands](https://manual.raycast.com/script-commands) instead.
- **IR stays Raycast-header-shaped** — extend `CommandDef` / `CrossTargetHints` rather than inventing parallel definition formats. Static Raycast surfaces (snippets, quicklinks) get optional fields on the core IR, not a second IR type.
- **PopClip stdin is idiomatic** — prefer PopClip's native `stdin: text` action property over hand-rolled `POPCLIP_TEXT | { body }` wrappers where the body contract is stdin-based. Keep wrapper injection as fallback for non-bash bodies if needed.
- **Dropzone actions are Ruby-header bundles** — emit `action.rb` with `# Name:` metadata plus a shell-out stub; `files` modality maps to `Handles: Files` and `ENV['items']` / `dragged_type`.
- **Apple Shortcuts has no silent import CLI** — emitter produces a signed `.shortcut` (via `shortcuts sign --mode anyone`) or a documented import flow; `apply` opens the file for user confirmation. Full shortcut XML codegen is a separate complexity tier; v1 emits a minimal "Run Shell Script" shortcut that delegates to the polycast body contract.
- **Agent CLI is a first-class target** — flat executable under `build/agent-cli/` with `--input` / argv mapping; this is also the future thin-shim dispatcher endpoint (ideation survivor #3).
- **Validation before apply** — each emitter exports `validate(cmd, files)` checks; `build --strict` runs them; `apply` refuses on failure.

## Implementation units

### U1. Platform spec audit (latest specs per destination)

- **Goal:** Durable reference docs under `docs/specs/` that ce-work can cite while implementing emitters. Each doc lists required fields, I/O contract, packaging layout, install path, reload behavior, and official source URLs (with fetch date).
- **Requirements:** R1
- **Files:**
  - `docs/specs/raycast-script-commands.md`
  - `docs/specs/raycast-snippets-quicklinks.md`
  - `docs/specs/popclip-extensions.md`
  - `docs/specs/dropzone-actions.md`
  - `docs/specs/apple-shortcuts.md`
  - `docs/specs/agent-cli.md`
  - `docs/specs/modality-matrix.md`
- **Approach:**
  - **Raycast script commands:** Required `# @raycast.schemaVersion 1`, `title`, `mode` (`silent` | `compact` | `fullOutput` | `inline`). Optional: `icon`, `iconDark`, `packageName`, `description`, `author`, `needsConfirmation`, `currentDirectoryPath`, `refreshTime` (inline only), `argument1..3` JSON (`text` | `password` | `dropdown` + `data`). Args arrive as `$1..$3`. Sources: GitHub `documentation/ARGUMENTS.md`, `OUTPUTMODES.md`, README metadata table.
  - **Raycast snippets:** JSON array entries `{ name, text, keyword? }`. Import via Raycast UI or operator JSON files (`~/.dotfiles/raycast/shell-functions-snippets.json`). Static text only — no script body.
  - **Raycast quicklinks:** JSON `{ name, link, openWith? }` with `{argument name="..."}` templates in `link`. Static URL/open — maps to `modality: none` with `x.raycast.quicklink`.
  - **PopClip:** `.popclipext/` package with `Config.json|yaml|plist`; top-level `identifier`, `name`, `icon`, `actions[]`. Shell script actions: `shell script file`, optional `interpreter`, `stdin` (e.g. `text` → `POPCLIP_TEXT`). Selection via `POPCLIP_TEXT` env or stdin. Filters: `requirements`, `regex`, app allow/deny lists. Unsigned local extensions show a warning. Source: [popclip.app/dev](https://www.popclip.app/dev/).
  - **Dropzone:** `.dzbundle/action.rb` with comment header fields: `Name`, `Description`, `Handles` (`Files` | `Text` | both), `Events` (`Dragged` | `Clicked`), `Creator`, `URL`, optional `SkipConfig`, `MinDropzoneVersion`, `RunsSandboxed`, `KeyModifiers`. Runtime env: `items`, `dragged_type`, `support_folder`. Install: `~/Library/Application Support/Dropzone 4/Actions/` or Dropzone 5 equivalent. Source: [aptonic/dropzone4-actions README](https://github.com/aptonic/dropzone4-actions/blob/master/README.md).
  - **Apple Shortcuts:** CLI verbs `run`, `list`, `view`, `sign` only — no create/import subcommand. `.shortcut` files are signed plist/XML; import requires user confirmation via Shortcuts.app. `shortcuts run "Name" -i path -o path` for headless execution with file I/O. Source: `shortcuts(1)`, Apple Support guide.
  - **Agent CLI:** Conventional `--help`, exit codes, stdin/argv contract aligned with polycast body modalities; install to `~/.agents/tools/` or project `bin/`.
  - **Modality matrix:** Table of which `Modality` each target supports and the wrapper translation (stdin, `$1..$n`, `"$@"`, none).
- **Tests:** Each spec doc includes at least one real-world example traced to dotfiles or vendor samples; modality matrix covers all six targets × four modalities with skip/translate notes.
- **Verification:** Peer review against live vendor docs; `grep -l "Source:" docs/specs/*.md | wc -l` equals 7.

### U2. Destination design spec (IR → platform mapping)

- **Goal:** `docs/DESIGN.md` expanded (or companion `docs/specs/destination-mapping.md`) with field-by-field mapping tables, wrapper templates, output tree layout, and `apply` install map.
- **Requirements:** R2, R6
- **Files:** `docs/DESIGN.md`, `docs/specs/destination-mapping.md`, `src/types.ts` (type additions only if design locks them)
- **Approach:**
  - Define `CommandDef` extensions for static surfaces: `x.raycast.snippet`, `x.raycast.quicklink`.
  - Document wrapper snippets per modality per target (bash-first; note node/applescript gaps).
  - Specify `build/<target>/` layout per emitter and ownership marker file (e.g. `.polycast-owned`).
  - Map each target → runtime install dir → reload mechanism (Raycast rescans script dirs; PopClip double-click install; Dropzone bundle copy; Shortcuts sign+open; agent-cli PATH symlink).
- **Tests:** Design review checklist: every `CommandDef` field maps to ≥0 targets or explicit "N/A"; every target required field has IR source or `x.*` hint.
- **Verification:** Walkthrough with `commands/open-repo.ts` and `commands/uppercase.ts` showing expected output per target.

### U3. Raycast script emitter — full metadata parity

- **Goal:** `raycast-script` emitter covers the complete Raycast metadata surface needed by polycast commands, not just the minimal subset today.
- **Requirements:** R3, R4, R6
- **Files:** `src/emitters/raycast-script.ts`, `src/types.ts`, `test/emitters.test.ts`, `docs/specs/raycast-script-commands.md`
- **Approach:** Extend `CrossTargetHints.raycast` for `iconDark`, `needsConfirmation`, `currentDirectoryPath`, `refreshTime`. Extend `CommandArg` for `type`, `percentEncoded`, `data` (dropdown). Emit `argument1..3` faithfully. Keep `supports: ["args", "none"]`.
- **Tests:** Fixture commands for dropdown arg, inline+refreshTime, password arg; assert header JSON matches spec.
- **Verification:** `script/test`; optional round-trip against dotfiles `validate-raycast-tree.py` pattern if vendored.

### U4. PopClip emitter — spec-aligned packages

- **Goal:** PopClip bundles match current PopClip dev reference; use native `stdin: text` where possible.
- **Requirements:** R3, R4, R6
- **Files:** `src/emitters/popclip.ts`, `src/types.ts`, `test/emitters.test.ts`
- **Approach:** Add top-level config fields (`popclip version`, `identifier` format). Set action `stdin: text` + executable shebang script containing body only (no printf wrapper) for bash bodies. Map `x.popclip.requirements`, optional `regex`, `after` step hints.
- **Tests:** Text command bundle loads structurally; args command skipped; script uses stdin contract per spec doc.
- **Verification:** `script/test`; manual double-click install of `build/popclip/*.popclipext` on dev machine.

### U5. Dropzone emitter (`files` modality)

- **Goal:** New `dropzone` target emitting valid `.dzbundle` with Ruby header + shell stub.
- **Requirements:** R3, R4, R6
- **Files:** `src/emitters/dropzone.ts`, `src/registry.ts`, `src/types.ts`, `test/emitters.test.ts`, `docs/specs/dropzone-actions.md`
- **Approach:** `supports: ["files"]`. Header from `CommandDef` + `x.dropzone` (`events`, `handles`, `skipConfig`, `minVersion`). Ruby body shells out to embedded bash with `"$@"` / items from Dropzone env. Default `Handles: Files`, `Events: Dragged`, `SkipConfig: Yes`, operator `Creator`/`URL` from project constants or `CommandDef.author`.
- **Tests:** Files command emits bundle; text/args commands skipped; header contains required Name/Description/Handles/Creator/URL.
- **Verification:** `script/test`; copy bundle to Dropzone Actions folder and drag a test file.

### U6. Raycast snippet and quicklink emitters (static surfaces)

- **Goal:** Two emitters for Raycast JSON import surfaces that do not execute script bodies directly.
- **Requirements:** R3, R6
- **Files:** `src/emitters/raycast-snippet.ts`, `src/emitters/raycast-quicklink.ts`, `src/registry.ts`, `src/types.ts`, `test/emitters.test.ts`
- **Approach:**
  - `raycast-snippet`: requires `x.raycast.snippet.text`; aggregates all compatible commands into one JSON array file (or per-command — decide in U2; default one `snippets.json` catalog).
  - `raycast-quicklink`: requires `x.raycast.quicklink.link` + optional `openWith`; supports templated links with args mapped to `{argument name="..."}` when modality is `args`.
  - Both `supports: ["none"]` plus optional args for quicklink templates only.
- **Tests:** Snippet from static text hint; quicklink with argument template; script-body-only commands skipped unless hints present.
- **Verification:** `script/test`; JSON validates against dotfiles import samples.

### U7. Apple Shortcuts emitter (`text` modality, v1 stub)

- **Goal:** `shortcuts` target emits importable `.shortcut` artifacts for text/share workflows without requiring hand-built shortcut XML for every action.
- **Requirements:** R3, R4, R6
- **Files:** `src/emitters/shortcuts.ts`, `src/registry.ts`, `src/types.ts`, `test/emitters.test.ts`, `docs/specs/apple-shortcuts.md`
- **Approach:** v1: generate minimal shortcut plist whose workflow is "Run Shell Script" (bash) with wrapper feeding share-sheet/shortcut input into body stdin contract; run `shortcuts sign --mode anyone` during `build` when CLI available (skip signing in CI with documented manual step). `supports: ["text"]`. Document that silent import is impossible — `apply` uses `open`.
- **Tests:** Text command produces `.shortcut` file; signing step mocked or gated on `which shortcuts`; args/files skipped.
- **Verification:** `script/test`; local import of signed artifact into Shortcuts.app.

### U8. Agent CLI emitter

- **Goal:** `agent-cli` target emits a standalone executable script per command for agent/terminal use.
- **Requirements:** R3, R6
- **Files:** `src/emitters/agent-cli.ts`, `src/registry.ts`, `test/emitters.test.ts`
- **Approach:** `supports: ["args", "none", "text"]`. Map modalities to `--text`, positional args, or stdin. Shebang from `body.lang`. Output `build/agent-cli/<id>` mode 755. This target becomes the future dispatcher stub destination (survivor #3) without implementing dispatcher yet.
- **Tests:** Each modality produces runnable stub; `--help` prints title/description.
- **Verification:** `script/test`; run emitted binary against fixture input.

### U9. Per-target validation framework

- **Goal:** Emitters validate required metadata and emitted shape; CLI exposes `--strict`.
- **Requirements:** R4
- **Files:** `src/types.ts` (extend `Emitter` with optional `validate`), `src/validate/*.ts` or per-emitter validators, `src/cli.ts`, `test/validate.test.ts`
- **Approach:** Extend `Emitter` interface with `validate?(cmd, files) => ValidationIssue[]`. IR validation stays in `assertValid`; emitted validation checks target-required fields (Raycast schemaVersion/title/mode; PopClip identifier/name; Dropzone Name/Handles/Creator/URL; etc.). `build --strict` fails on issues.
- **Tests:** Invalid fixture commands fail validation; valid fixtures pass.
- **Verification:** `script/cibuild`

### U10. `apply` — install, diff, safe prune

- **Goal:** Implement `polycast apply` to install `build/` artifacts into launcher runtime dirs idempotently.
- **Requirements:** R5
- **Files:** `src/apply.ts`, `src/cli.ts`, `docs/specs/destination-mapping.md` (install map), tests
- **Approach:** Per-target install adapter: desired paths from build output, actual paths in runtime dirs, ownership marker check before delete. Raycast → script commands dir / `_enabled` mirror pattern from dotfiles. PopClip → `~/Library/Application Support/PopClip/Extensions/`. Dropzone → Actions folder. Shortcuts → sign+open flow. Agent-cli → symlink into configured bin dir. Dry-run default; `--write` to mutate.
- **Tests:** Dry-run diff tests with temp dirs; prune never deletes unmarked files.
- **Verification:** `script/cibuild`; manual apply on dev machine for one command × two targets.

## Prior learnings applied

- None in `docs/solutions/` yet for this domain. Ideation doc (`2026-06-14-unified-launcher-command-generator.md`) is the primary constraint source: IR = extended Raycast header, modality skip-not-misemit, emitter registry leverage, apply ownership markers.

## Deferred / out of scope

- Thin-shim dispatcher (`polycast run <id>`) — follow-on after agent-cli emitter proves wrapper contract (ideation #3).
- Dropover, Yoink, Alfred, Keyboard Maestro targets.
- Cross-OS launcher formats (`.desktop`, Windows).
- Full Shortcuts XML workflow codegen for arbitrary action graphs (beyond Run Shell Script stub).
- Agent-native MCP tools for command authoring (ideation #6) — separate plan after emitters stable.
- Reverse parsers (Raycast `.sh` → `CommandDef`) — not needed for v1.

## Open questions

- **Q1 (U2):** Raycast snippet/quicklink aggregation — one catalog file per target vs one file per command? Default: one `snippets.json` / `quicklinks.json` per build for easier import matching dotfiles.
- **Q2 (U7):** Shortcuts v1 — is "Run Shell Script stub + sign" acceptable, or required to ship full plist workflows for operator shortcuts like "Send to Wiki Inbox"? Blocks U7 scope if full XML required.
- **Q3 (U10):** Dropzone 4 vs 5 Actions path — detect installed version or configure via env/`polycast.config`?
- **Q4 (U3):** Should `packageName` be required in polycast IR for Raycast targets, or remain optional with inferred fallback?
