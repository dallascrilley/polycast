# Project Context — polycast

Durable facts an agent needs that are NOT obvious from the code. Keep current.

## What it is

A transcompiler for macOS launcher commands. One canonical command definition
(`CommandDef`) is rendered into each launcher's native format by a per-target
emitter. Targets that overlap today: Raycast script commands, PopClip
extensions, Dropzone actions, Apple/iOS Shortcuts, Raycast snippets/quicklinks,
and standalone agent CLIs.

Origin: ideation in the dotfiles repo,
`~/.dotfiles/docs/ideation/2026-06-14-unified-launcher-command-generator.md`.

## Stack & architecture

- **Stack:** Node.js / TypeScript, run with bun. No production runtime — it is a
  build/codegen CLI.
- **Architecture:**
  - `src/types.ts` — the IR: `CommandDef` (metadata + body + `Modality`) and the
    `Emitter` interface.
  - `src/define.ts` — `defineCommand()` authoring helper + structural validation.
  - `src/load.ts` — loads `commands/*.ts` modules (default-exported `CommandDef`).
  - `src/emitters/*` — one module per target; `src/registry.ts` is the list.
  - `src/cli.ts` — `polycast list | build | targets | apply | run` (entry / `bin`).
  - `commands/*.ts` — the actual command definitions (data, not engine).

## The load-bearing idea: the I/O modality contract

Each launcher differs mainly in *what the body receives*: PopClip → a text
selection (`POPCLIP_TEXT`); Dropzone → dragged file paths (`"$@"`); Raycast →
typed arguments; Shortcuts → a share-sheet input. The body is authored once as a
pure `input → stdout` function; each emitter injects the wrapper that adapts its
surface's native input into that contract. An emitter declares which modalities
it `supports` and returns `[]` for anything it cannot represent (so `build`
*skips* rather than mis-emits).

## Environments

| Env | Where | Notes |
|-----|-------|-------|
| local | `bun run dev <cmd>` | `build` writes to `./build/<target>/` (gitignored) |
| ci | `script/cibuild` | bun install → lint → typecheck → test → build → `dev build --strict` |

## Key decisions

- **IR = an extended Raycast script-command header.** Adopt the richest existing
  dialect rather than invent a new format; add a small `x.<target>` namespace for
  surface-specific hints. (Survivor #1 in the ideation doc.)
- **Thin shims, not copied logic** (planned): generated artifacts should become
  small stubs that call back into one dispatcher; today emitters inline the body.
- **biome v2** is the linter/formatter (matches the v2-schema `biome.json` the
  bootstrap template ships). Pinned to `^2.5.0`.

## Known constraints & gotchas

- `apply` installs into launcher runtime dirs (dry-run default; `--write` to
  mutate). Ownership markers (`.polycast-owned`) gate safe prune. See
  `src/apply.ts` and `docs/specs/destination-mapping.md`.
- PopClip uses native `stdin: text` in Config.json; bodies read stdin.
- macOS-only by design (these are macOS launchers).

## External services & secrets

None. Local codegen only.

## Agent model

- **Model:** agent-assisted. Features (parsers, emitters) are normal code. An
  agent *consuming* polycast to author commands across surfaces is a planned use
  case (ideation survivor #6), not an agent-native architecture of this repo.
