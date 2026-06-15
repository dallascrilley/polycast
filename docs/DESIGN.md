# polycast — Design

Derived from the ideation artifact
`~/.dotfiles/docs/ideation/2026-06-14-unified-launcher-command-generator.md`.

## The structural insight

Every launcher surface is the same triple:

```
metadata header  +  script body  +  I/O contract
```

They differ only in (a) the metadata dialect, (b) the input modality, and
(c) packaging. So polycast is a **transcompiler**, not a framework: parse a
canonical definition, emit each dialect.

| Surface | Metadata dialect | Input modality | Packaging |
|---|---|---|---|
| Raycast script command | `# @raycast.*` comment header | `args` / `none` | single script file |
| Raycast snippet | JSON `{name,text,keyword}` | (static text) | JSON array entry |
| Raycast quicklink | JSON `{name,link,openWith}` | (URL template) | JSON array entry |
| PopClip | `Config.json` / YAML header | `text` (selection) | `.popclipext` bundle |
| Dropzone | `# Name:/# Handles:/# Events:` header | `files` (dragged) | `.dzbundle` |
| Dropover | Custom Script (Settings) | `files` (`"$@"`) | shell + manifest |
| Apple/iOS Shortcuts | Cherri → `.shortcut` | `text` / share input | signed `.shortcut` |
| Agent CLI | argv / stdin | all modalities | executable on PATH |

## Components (current)

```
commands/*.ts ──load──> CommandDef[] ──registry──> emitters[] ──> build/<target>/
                            │                          │
                         src/types.ts             src/emitters/*
```

- **`CommandDef`** (`src/types.ts`) — the IR. `modality` is the load-bearing
  field; `x.<target>` holds surface-specific hints with no agnostic home.
- **`Emitter`** — `{ target, supports[], emit, emitCatalog?, validate? }`.
  `supports` is the modality compatibility list; `emit` returns `[]` to skip.
  Catalog emitters aggregate static Raycast JSON; optional `validate` runs on
  `build --strict`.
- **`registry.ts`** — the emitter list + `emitCommand()` fan-out (with `skipped`
  bookkeeping). Adding a target is: write an emitter, add it here.
- **Forge boundary** — polycast syncs multi-target artifacts via `apply`; forge
  manages single-tool install/promotion. Agent-cli output is forge-wrap compatible.
  See [`docs/specs/destination-mapping.md`](specs/destination-mapping.md) and
  [`docs/research/2026-06-14-destination-emitters-findings.md`](research/2026-06-14-destination-emitters-findings.md).

## Mapping to the ideation survivors

| # | Survivor | Status |
|---|---|---|
| 1 | Canonical IR = extended Raycast header | **done** (`CommandDef`; `x.raycast` hints) |
| 2 | I/O modality contract | **done** (`Modality` + per-emitter `supports` + wrapper injection) |
| 3 | Thin shims over one dispatcher | **done** for agent-cli (`polycast run` + JSON store); other emitters still inline |
| 4 | Pluggable target emitters | **done** (8 targets in registry) |
| 5 | Idempotent `apply` into live runtime dirs | **done** (dry-run default; `--write` to install) |
| 6 | Agent-native action registry | **done** (stdio MCP + `docs/agent-native/capability-map.md`; PR #9) |
| 7 | Per-target validation of emitted artifacts | **done** (`build --strict`) |

## Roadmap

1. ~~**Agent-native registry** (#6)~~ — shipped (MCP stdio server, PR #9).
2. **Dropover programmatic import** — **closed (opaque)**; staging + manifest until API documented ([research](../research/2026-06-15-dropover-import-findings.md)).
3. **Extend thin-shim dispatcher** to Raycast/PopClip/Dropzone emitters.
4. **Operator verification** — P1-2 in `LAUNCH_CRITERIA.md` (Dropzone + agent-cli `apply --write` on a real Mac).

## Non-goals

- Cross-OS targets (`.desktop`, Windows). These are macOS launchers.
- A new bespoke definition language. The IR stays close to the Raycast header.
