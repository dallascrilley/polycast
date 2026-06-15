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
| Apple/iOS Shortcuts | `shortcuts` CLI | `text` / share input | binary `.shortcut` |
| Agent CLI | argv | `args` / stdin | executable on PATH |

## Components (current)

```
commands/*.ts ──load──> CommandDef[] ──registry──> emitters[] ──> build/<target>/
                            │                          │
                         src/types.ts             src/emitters/*
```

- **`CommandDef`** (`src/types.ts`) — the IR. `modality` is the load-bearing
  field; `x.<target>` holds surface-specific hints with no agnostic home.
- **`Emitter`** — `{ target, supports[], emit(cmd) -> EmittedFile[] }`.
  `supports` is the modality compatibility list; `emit` returns `[]` to skip.
- **`registry.ts`** — the emitter list + `emitCommand()` fan-out (with `skipped`
  bookkeeping). Adding a target is: write an emitter, add it here.

## Mapping to the ideation survivors

| # | Survivor | Status |
|---|---|---|
| 1 | Canonical IR = extended Raycast header | **done** (`CommandDef`; `x.raycast` hints) |
| 2 | I/O modality contract | **done** (`Modality` + per-emitter `supports` + wrapper injection) |
| 3 | Thin shims over one dispatcher | planned — emitters currently inline the body |
| 4 | Pluggable target emitters | **done** (registry; 2 of N emitters) |
| 5 | Idempotent `apply` into live runtime dirs | planned — `apply` stubbed in CLI |
| 6 | Agent-native action registry | planned — IR is already machine-writable |
| 7 | Per-target validation of emitted artifacts | planned — `assertValid` covers the IR only |

## Roadmap

1. **More emitters** (#4): `dropzone` (files), `shortcuts` (text/share),
   `raycast-snippet` + `raycast-quicklink` (static surfaces), `agent-cli`.
2. **`apply`** (#5): map each target → install dir + reload; diff desired vs.
   installed; prune only polycast-owned artifacts (ownership marker). Mirror the
   dotfiles `_enabled/` generated-mirror contract.
3. **Per-target validation** (#7): each emitter asserts its loader's required
   fields before `apply` writes (reuse the dotfiles Raycast validator as a model).
4. **Thin-shim dispatcher** (#3): generate stubs that call `polycast run <id>`;
   logic lives once.

## Non-goals

- Cross-OS targets (`.desktop`, Windows). These are macOS launchers.
- A new bespoke definition language. The IR stays close to the Raycast header.
