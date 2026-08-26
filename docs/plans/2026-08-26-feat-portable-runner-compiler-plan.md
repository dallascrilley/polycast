---
date: 2026-08-26
origin: docs/ideation/2026-08-26-polycast-command-runner-opportunities.md
tracker_epic: WKS-323
---

# Ship a portable Polycast runner compiler

This plan is the implementation contract for [WKS-323](https://linear.app/dallascrilley/issue/WKS-323/make-runnerdef-a-target-neutral-runner-compiler). Keep this document current while the work is active.

## Summary

Replace the Orca-shaped `RunnerDef` with a target-neutral runner contract. Route runner builds through a typed registry, preserve Orca output, and add a concrete `codex-cli` target. One committed definition must produce both outputs without copying its prompt or portable metadata.

The change does not merge `RunnerDef` into `CommandDef`. It does not install runners, add runner MCP tools, publish a package, or change live Orca or Codex configuration.

## Requirements

- R1. A canonical runner uses `kind: "runner"` and keeps its ID, publisher, title, description, version, and commands outside target-specific options.
- R2. A prompt command declares `context: "worktree"` and `mode: "run" | "stage"`. Targets translate that intent or refuse it.
- R3. Orca-only engine metadata lives under `x["orca-plugin"]`. The Orca emitter preserves today's manifest and worker behavior.
- R4. The loader accepts the legacy `kind: "orca-plugin"` shape through the 0.2 release line and normalizes it before emitters see it.
- R5. A typed registry owns runner target discovery, compatibility checks, and emission for `orca-plugin` and `codex-cli`. Emitted files carry optional modes, and the writer applies them on both new and existing paths.
- R6. A Codex wrapper invokes `codex exec --cd <git-root> -` with the prompt on stdin. Generated wrappers add no approval, sandbox, model, profile, or configuration override.
- R7. An implicit all-target build reports an incompatible target as skipped. An explicitly requested incompatible, unknown, duplicate, or empty target selection fails before any output is written. Build-wide emitted paths must also be unique before the first filesystem write.
- R8. `runner list`, `runner targets`, and `runner build --target` expose the same registry-backed target facts.
- R9. Focused behavioral tests and `script/cibuild` pass without launching a real Orca host, Codex agent, or other external application.

## Current implementation

`src/runners/schema.ts` owns both the public schema and inferred TypeScript type. Its top-level `kind: "orca-plugin"`, `engine`, and terminal-oriented command fields bind the definition to Orca.

`src/runner-api.ts` loads every runner, calls `emitOrcaPluginBundle` directly, and then writes the returned files. `src/runners/orca-plugin.ts` owns the emitted-file shape, path safety check, manifest renderer, and worker renderer. The CLI exposes only `runner list` and `runner build` and has no runner target selector.

This direct path has one valuable invariant: Polycast loads and renders the complete definition set before creating output. Preserve that invariant while adding the registry.

## Key decisions

### Keep portable intent in the definition

The canonical definition has this shape:

- `kind: "runner"`
- `id`, `publisher`, `title`, optional `description`, and `version`
- `commands`, where each current command has `kind: "prompt"`, `id`, `title`, `context: "worktree"`, `prompt`, and `mode`
- optional `x`, with an `"orca-plugin"` entry that contains the required Orca engine range

`mode: "run"` tells a target to execute the prompt. `mode: "stage"` tells an interactive target to prepare the prompt without execution. Orca maps these modes to `enter: true` and `enter: false`. Codex CLI supports only `run` because a headless process cannot stage text for an operator.

The committed `schemas/runner-def.schema.json` describes only the canonical contract. `RunnerDefInput` also includes a deprecated legacy type so existing TypeScript definitions compile during the compatibility period. `parseRunnerDef` accepts either shape and always returns canonical `RunnerDef`.

The legacy mapping is exact:

- `kind: "orca-plugin"` becomes `kind: "runner"`.
- `engine` moves to `x["orca-plugin"].engine`.
- `kind: "terminal-prompt"` becomes `kind: "prompt"`.
- `enter: "submit"` becomes `mode: "run"`.
- `enter: "insert"` becomes `mode: "stage"`.

`loadRunners` returns each canonical definition with source metadata and a deprecation warning when normalization occurred. The CLI prints that warning once per legacy source. Emitters never accept the legacy type.

### Put compatibility and emission in one registry

Add `src/runners/types.ts` for `RunnerEmittedFile`, `RunnerTargetCompatibility`, and `RunnerEmitter`. An emitter owns a literal target ID, a compatibility function, and an emit function.

Add `src/runners/registry.ts` with an immutable `runnerEmitters` tuple. Derive `RunnerTargetId` from that tuple. The registry exports target lookup, compatibility evaluation, and runner emission. `src/runner-api.ts` owns build-wide preflight and filesystem writes, not individual emitters.

For each definition and requested target, preflight produces either `supported` or `skipped` with one concrete reason. If the caller supplied `targets`, any unknown or skipped target rejects the whole build before `mkdir` or `writeFile`. Without `targets`, Polycast emits supported targets and returns skipped targets in the summary.

`RunnerListEntry` returns target compatibility records instead of one hard-coded target. `RunnerBuildSummary` retains `outRoot`, `written`, and `files` and adds one result per target with its status, files, and optional skip reason.

Preflight also checks emitted path uniqueness across the whole build. This
rejects command IDs such as `runner.json`, or the combination `foo` and
`foo.prompt.txt`, when their Codex output paths collide. File mode is part of
the emitter contract, and the writer runs `chmod` after every executable write
so replacing a `0644` file restores `0755`.

### Make Codex CLI a concrete adapter

Add `src/runners/codex-cli.ts` with target ID `codex-cli`. Emit files under `codex-cli/<publisher>.<runner-id>/`:

- `<command-id>`, executable mode `0755`
- `<command-id>.prompt.txt`, prompt bytes plus one trailing newline
- `runner.json`, metadata for the qualified runner and every emitted command

The executable accepts zero or one positional worktree path. It uses the current directory when the argument is absent, rejects extra arguments with exit code 2, and resolves the Git root with `git -C <candidate> rev-parse --show-toplevel`. It exits before Codex when the candidate is not a Git worktree.

The wrapper locates its prompt file relative to the executable and runs `exec codex exec --cd <git-root> -` with stdin redirected from that file. Keeping the prompt outside the shell source avoids shell interpolation and delimiter collisions.

`runner.json` has `schemaVersion: 1`, the qualified runner ID, portable metadata, and command rows containing the ID, title, context, mode, executable path, and prompt-file path. It contains no Orca engine data.

### Preserve the target boundary

Three designs were considered:

1. Keep Orca fields in the core and add optional Codex fields. This spreads host rules through the public type and loses the compiler boundary.
2. Store a generic shell command in `RunnerDef`. This lets definitions bypass typed adapters and makes safety depend on string conventions.
3. Keep prompt intent neutral and add one emitter per host. This is the selected design because each target owns translation and can reject unsupported intent.

## Implementation units

### U1. Normalize the runner contract

- Requirements: R1, R2, R3, R4.
- Change `src/runners/schema.ts`, `src/runners/define.ts`, `src/runners/load.ts`, the committed runner fixture, and `schemas/runner-def.schema.json`.
- Add canonical-schema tests, legacy normalization tests, duplicate-ID tests, invalid target-hint tests, and exact JSON Schema comparison.
- Preserve the existing length, path-safe ID, reserved-name, semver, engine-range, and command-count constraints.
- Verify with `bun test test/runner-schema.test.ts test/runner.test.ts`.

### U2. Introduce the runner emitter registry

- Requirements: R3, R5, R7.
- Add `src/runners/types.ts` and `src/runners/registry.ts`. Move shared emitted-file and path-safety contracts out of the Orca module.
- Update the Orca emitter to accept only canonical `RunnerDef`, implement compatibility, and map `run` and `stage` to the existing Enter behavior.
- Test deterministic lookup, unknown targets, compatibility results, safe paths, and unchanged Orca manifest and worker behavior.
- Verify with `bun test test/runner.test.ts`.

### U3. Emit and execute Codex CLI runners

- Requirements: R5, R6, R7, R9.
- Add `src/runners/codex-cli.ts` and focused fixtures in `test/runner.test.ts`.
- Prove exact output paths, prompt bytes, metadata, and executable modes.
- Execute a generated wrapper with a fake `codex` binary in `PATH`. Capture its arguments, working root, and stdin. Assert that no forbidden flag appears.
- Test zero arguments, one worktree argument, extra arguments, a non-Git directory, a missing prompt file, and a `stage` command.
- Verify with `bun test test/runner.test.ts`.

### U4. Route the API and CLI through the registry

- Requirements: R5, R7, R8.
- Update `src/runner-api.ts` and `src/cli.ts` to support registry-backed listing, `runner targets`, and comma-separated `runner build --target` values.
- Complete every definition and target preflight before creating the output root. Preserve deterministic file ordering.
- Update wrapper tests for help text, target listing, explicit dual-target builds, unknown targets, and explicit incompatible targets.
- Verify with `bun test test/runner.test.ts test/polycast-wrapper.test.ts`.

### U5. Update documentation and run the full proof

- Requirements: R1 through R9.
- Update the runner guide, architecture document, README command reference, and generated schema instructions. State that Codex CLI output is build-only and inherits the operator's normal Codex configuration.
- Build the committed runner for both targets into a temporary directory. Inspect the Orca manifest, Codex metadata, file modes, and executable behavior with a fake Codex binary.
- Run `script/cibuild`. Keep `.github/workflows/ci.yml` pointed at this full command and do not gate it with the path filter.

## Validation and acceptance

Run the focused suite:

```bash
bun test test/runner-schema.test.ts test/runner.test.ts test/polycast-wrapper.test.ts
```

Run the dual-target compiler against a temporary output directory:

```bash
POLYCAST_SKIP_CHERRI=1 bun run dev runner build \
  --target orca-plugin,codex-cli \
  --out "$RUNNER_PROOF_DIR"
```

The command must report both targets. The Orca bundle must contain `orca-plugin.json` and `main.mjs`. The Codex bundle must contain one executable, one prompt file, and `runner.json` for the committed `polycast.worktree-review` runner.

Run the repository gate:

```bash
script/cibuild
```

Do not claim completion from type checks or file presence alone. The generated Orca worker must run against the fake host, and the generated Codex executable must run against the fake binary.

## Worktree and concurrency

- Worktree slug: `codex/wks-323-portable-runner-compiler`.
- Create a fresh Orca-managed worktree from freshly fetched `origin/main`. Do not reuse the ideation worktree or edit the primary checkout.
- The primary checkout currently has a local commit that is not on `origin/main`. Preserve it.
- Existing worktrees include `codex/runnerdef-orca-plugin` and other release or remediation branches. Do not remove, retarget, or modify them. Before implementation, confirm whether their commits already exist on the fresh base and record any overlapping unmerged diff.
- One writer owns `src/runners/schema.ts`, `src/runner-api.ts`, `src/cli.ts`, and runner tests for the full change. Do not split these shared files across parallel writers.

## Recovery

All new output remains build-only. Tests use temporary directories and fake executables. No implementation step writes to Orca, Codex configuration, launcher directories, or user command stores.

If a unit fails, leave the last passing commit intact and repair the same branch. Do not create another attempt branch. A normal Git revert removes the feature because the legacy reader keeps existing definitions usable during the migration period.

## Deferred work

- Remove the legacy reader only in a breaking release after the 0.2 release line.
- Transactional runner installation belongs to WKS-324 and must precede any automated install command.
- Inventory capture, contextual prompts, MCP parity, structured automation, command-schema consolidation, and broader effect adapters remain in WKS-325 through WKS-330.

## Progress

- [x] U1. Normalize the runner contract.
- [x] U2. Introduce the runner emitter registry.
- [x] U3. Emit and execute Codex CLI runners.
- [x] U4. Route the API and CLI through the registry.
- [x] U5. Update documentation and run the full proof.

## Decision log

- 2026-08-26: Keep RunnerDef distinct from CommandDef because runner prompts describe agent work, while CommandDef describes shell-command bodies and launcher input contracts.
- 2026-08-26: Use `codex-cli` as the first headless target. Add other agent CLIs as separate emitters.
- 2026-08-26: Treat `stage` as unsupported for Codex CLI instead of changing its meaning.
- 2026-08-26: Keep compatibility parsing at the authoring boundary so emitters operate on one canonical type.
- 2026-08-26: Retain legacy provenance through `defineRunner` and `loadRunners` so the CLI can warn once for each legacy source after normalization.
- 2026-08-26: Reject duplicate and empty explicit target selections instead of silently changing operator intent.
- 2026-08-26: Treat emitted path uniqueness and executable mode application as build-wide preflight and writer contracts.

## Revision history

- 2026-08-26: Created the implementation plan from the ranked ideation artifact and linked WKS-323.
- 2026-08-26: Completed U1 through U5 with focused runtime tests, an explicit dual-target proof, and `script/cibuild`.
