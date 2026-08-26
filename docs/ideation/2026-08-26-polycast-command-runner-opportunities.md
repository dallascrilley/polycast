---
date: 2026-08-26
subject: Polycast command and runner expansion
focus: game changing feature 10x ideas/opportunities
mode: autonomous-discovery
axes: [Runner portability, Lifecycle safety, Authoring and migration, Agent-native operation, Contract and test integrity]
candidates_generated: 18
survivors: 8
---

# Ideation: Polycast command and runner expansion

Subject & Grounding: Polycast 0.1.0 has a mature `CommandDef` pipeline with eight emitters, dispatcher-backed execution, dry-run installation, ownership markers, CLI and MCP entry points, and 106 passing tests. Its newer `RunnerDef` pipeline is narrower: one Orca-only runner kind, static terminal prompts, build-only output, and no MCP, installation, reconciliation, or import lifecycle. This pass inspected exact `origin/main` at `8268486c3d602ec3eb55beced16578ba211a5041`, including the command and runner schemas, loaders, emitters, apply path, CLI, MCP server, test suite, recent 30-commit churn, and historical ideation.

Cull Summary: Generated 18 candidates and retained 8. Ten were removed or folded into stronger siblings for redundancy with a broader lifecycle proposal (6), insufficient current-scale evidence for a performance claim (2), dependence on unverified Orca manifest metadata (1), and low standalone value (1). The generation pass covered all six required frames: pain and friction in repeated builds and manual installs; inversion through manifests, importers, and preflight; assumption-breaking through a target-neutral runner model; leverage through shared registries and contracts; cross-domain analogies from compilers, package managers, and transaction journals; and constraint-flipping through hermetic tests and machine-readable execution.

### Grounding diagnostics

| Probe | Verified result | Consequence for ideation |
|---|---|---|
| Resume check | No current file exists under `docs/ideation/`; Git history contains a June 2026 pass whose five priorities were delivered, deferred, or superseded. | Start fresh and avoid repeating the original CommandDef, modality, thin-shim, emitter, apply, MCP, and validation ideas recorded as complete in `docs/DESIGN.md`. |
| Build topology | `package.json` uses Bun, TypeScript, Zod, MCP SDK, and Biome. `script/cibuild` passed at the exact baseline with 106 tests, strict command build, runner build, version check, and package smoke. | Favor extensions to the existing typed compiler and shared API over a new service or framework. |
| Friction markers | No `FIXME`, `HACK`, `@ts-expect-error`, `eslint-disable`, or `ts-ignore` markers exist. Repeated broad filesystem fallbacks appear in `src/apply.ts` and `src/post-build.ts`; external effects are hard-coded in `src/run.ts`, `src/post-build.ts`, and `src/apply.ts`. | The important debt sits at runtime boundaries, not in comment backlogs. |
| Git churn | Over the last 30 commits, `src/apply.ts`, `src/cli.ts`, and `src/polycast-api.ts` had the highest code churn. Runner support arrived only in the final three feature and release commits. | Consolidate lifecycle and automation contracts before adding many more runner targets. |
| Test density | Fourteen test files contain 2,269 lines. Runner behavior has 21 focused behavior and schema cases, but CI runs on Ubuntu, skips Cherri, and does not activate an Orca plugin. | Keep structural proof, then add hermetic host simulation and a small real-macOS acceptance lane. |
| Architectural boundary | `CommandDef` fans out through eight emitters and has run, build, apply, prune, CLI, and MCP paths. `RunnerDef` has one Orca-specific kind, one emitter, list/build CLI only, and no lifecycle or MCP path. | The largest opportunity is to extend the proven compiler pattern without merging command and runner semantics. |

## Ranked Overview

Impact uses High = 3, Medium = 2, Low = 1. Scope uses Small = 1, Medium = 2, Large = 3. Priority score is Impact divided by Scope. Strategic fit and dependency order break ties. No survivor is rated High/Small, so the forced-distribution ceiling of two is satisfied.

| # | Improvement | Axis | Impact | Scope | Priority Score | Implementation Action |
|---|-------------|------|--------|-------|----------------|-----------------------|
| 1 | Make RunnerDef a target-neutral runner compiler | Runner portability | High | Large | 1.00 (High/Large) | Split runner intent from Orca emission and add a runner target registry behind `polycastRunnerBuild`. |
| 2 | Publish and install from transactional state manifests | Lifecycle safety | High | Large | 1.00 (High/Large) | Stage, hash, preflight, publish, reconcile, and roll back command and runner artifacts as one declared plan. |
| 3 | Capture existing launcher and runner inventories | Authoring and migration | High | Large | 1.00 (High/Large) | Add fixture-driven importers that turn existing Raycast exports and supported Orca inventory into reviewable definitions. |
| 4 | Add context-aware runners with explicit terminal selection | Runner portability | High | Large | 1.00 (High/Large) | Extend terminal prompts with safe context tokens, preview, and fail-closed terminal selection policies. |
| 5 | Give agents runner parity through MCP | Agent-native operation | Medium | Medium | 1.00 (Medium/Medium) | Expose runner list, inspect, and build over MCP with temporary output by default and no install authority. |
| 6 | Fail closed with a structured automation contract | Agent-native operation | Medium | Large | 0.67 (Medium/Large) | Replace permissive flag parsing and prose-only errors with typed targets, stable codes, and JSON output. |
| 7 | Make one schema authoritative at every command boundary | Contract and test integrity | Medium | Large | 0.67 (Medium/Large) | Use a discriminated command contract for TypeScript, Zod, JSON Schema, stored JSON, and long-lived MCP reloads. |
| 8 | Put every external effect behind a hermetic adapter | Contract and test integrity | Medium | Large | 0.67 (Medium/Large) | Inject process, tool, and UI adapters and drive a complete modality, language, and target conformance suite. |

### Rationale for Top Improvement

Item 1 ties for the highest numeric score and has the strongest strategic fit. Today `RunnerDef` describes an Orca plugin rather than a reusable task, so Polycast cannot cast one intelligent runner into Orca, a headless agent CLI, or another launcher without duplicating the definition. A target-neutral runner model extends the compiler idea that already works for commands while preserving the deliberate separation between `CommandDef` and `RunnerDef`.

## Detailed Improvement Dossiers

### 1. Make RunnerDef a target-neutral runner compiler

- Axis & Priority: Runner portability | High/Large, score 1.00
- Frames: Assumption-Breaking; Leverage & Compounding; Cross-Domain Analogy
- Basis: `direct:` `src/runners/schema.ts` exports `runnerDefSchema`, whose only variant is `kind: "orca-plugin"`; `src/runners/orca-plugin.ts` exports `emitOrcaPluginBundle`; `src/runner-api.ts` calls that emitter directly. `external:` compiler front-end and back-end separation. `reasoned:` runner intent cannot compound across surfaces while the public definition embeds one host's packaging and engine fields.
- Blast Radius & Reversibility: Core | Two-Way Door. Keep the current Orca-shaped definition accepted during a bounded migration, then remove the compatibility reader after committed definitions migrate.
- Value Impact: One runner fixture must emit at least two independently usable targets without duplicating its prompt or metadata. Adding a later runner target should require a new emitter registration, not edits to every RunnerDef.
- Trade-off / Downside: A neutral model can become vague if it hides real host differences. Keep host-specific options in explicit `x.<target>` hints and reject unsupported mappings rather than guessing.
- Implementation Blueprint:
  - Target Files / Symbols: `src/runners/schema.ts: runnerDefSchema`, `src/runner-api.ts: polycastRunnerBuild`, `src/runners/orca-plugin.ts: emitOrcaPluginBundle`, `src/cli.ts: cmdRunner`, `schemas/runner-def.schema.json`, new `src/runners/registry.ts`, new runner emitter modules
  - Action: Define runner intent and command kinds independently from output targets. Add a typed runner emitter interface and registry, move Orca packaging behind it, and add a headless agent-CLI emitter as the second proof target. Preserve `CommandDef` as the shell-command IR.
  - Verification Probe: `bun test test/runner.test.ts test/runner-schema.test.ts && POLYCAST_SKIP_CHERRI=1 bun run dev runner build --target orca-plugin,codex-cli --out build/runner-proof`

### 2. Publish and install from transactional state manifests

- Axis & Priority: Lifecycle safety | High/Large, score 1.00
- Frames: Pain & Friction; Inversion / Removal / Automation; Leverage & Compounding; Cross-Domain Analogy
- Basis: `direct:` `src/polycast-api.ts` functions `buildCommands` and `polycastApply`, `src/apply.ts` functions `applyBuilt` and `pruneOwned`, and `src/runner-api.ts` function `polycastRunnerBuild` write sequentially into live output or install trees. A later validation, ownership refusal, or copy failure can follow earlier writes; runner builds also leave stale bundles for deleted definitions. `external:` package-manager lock state and write-ahead transaction journals.
- Blast Radius & Reversibility: Core | Two-Way Door. The existing dry-run output can remain available while manifest-backed commit becomes the only write path.
- Value Impact: A failed build or apply must leave the previous complete state byte-for-byte intact. A successful reconciliation must report added, updated, removed, unchanged, and refused paths with content hashes.
- Trade-off / Downside: Cross-directory launcher installs cannot be one filesystem rename. A journal and rollback copies add disk I/O and demand careful crash recovery.
- Implementation Blueprint:
  - Target Files / Symbols: `src/polycast-api.ts: buildCommands`, `src/polycast-api.ts: polycastApply`, `src/apply.ts: applyBuilt`, `src/apply.ts: pruneOwned`, `src/runner-api.ts: polycastRunnerBuild`, new `src/state-manifest.ts`, new `src/install-journal.ts`
  - Action: Render and validate into staging, emit a versioned path-and-digest manifest, preflight every destination and ownership rule, then commit from the plan. Record prior bytes and modes for rollback. Add explicit runner install, remove, and reconcile commands only after the same state engine covers command targets.
  - Verification Probe: `bun test test/operator-apply.test.ts test/cold-user.test.ts test/runner.test.ts`; inject a copy failure after the first target and assert exact restoration, then delete one definition and assert only manifest-owned stale output disappears.

### 3. Capture existing launcher and runner inventories

- Axis & Priority: Authoring and migration | High/Large, score 1.00
- Frames: Inversion / Removal / Automation; Assumption-Breaking; Cross-Domain Analogy; Constraint-Flipping
- Basis: `direct:` `src/load.ts: loadCommands` and `src/runners/load.ts: loadRunners` only ingest authored TypeScript modules. `commands/` contains four samples, while README states the sample pack is not a library. No importer or capture command exists. `external:` compiler front ends and package-manager import commands. `reasoned:` a canonical catalog cannot become the source of truth if adopting it requires manually recreating every existing Raycast snippet, quicklink, script command, and Orca runner.
- Blast Radius & Reversibility: Surface | Two-Way Door. Import defaults to preview and writes a new directory only after review; it never edits the source launcher inventory.
- Value Impact: Fixture inventories must convert into deterministic, schema-valid definitions with an explicit loss report. Re-importing unchanged input must produce no diff.
- Trade-off / Downside: Every source format has fields Polycast cannot represent. The importer must preserve unsupported data in a report or target hint, never silently discard it.
- Implementation Blueprint:
  - Target Files / Symbols: `src/cli.ts: main`, `src/command-source.ts: commandDefToModule`, `src/schema/command-def.ts: commandDefSchema`, `src/runners/schema.ts: runnerDefSchema`, new `src/importers/raycast.ts`, new `src/importers/orca.ts`, new `src/import-report.ts`
  - Action: Add `polycast capture --from <source> --input <path>` with preview by default. Start with exported Raycast snippets and quicklinks because their JSON shapes already map to current emitters. Gate Orca capture on a documented inventory API or explicit export file, then generate RunnerDef modules plus a loss and conflict report.
  - Verification Probe: `bun test test/importers.test.ts`; import fixed Raycast and Orca fixtures twice, validate every generated module through the committed schemas, and assert byte-identical output plus explicit diagnostics for every unmapped field.

### 4. Add context-aware runners with explicit terminal selection

- Axis & Priority: Runner portability | High/Large, score 1.00
- Frames: Assumption-Breaking; Cross-Domain Analogy; Constraint-Flipping
- Basis: `direct:` `src/runners/orca-plugin.ts: workerHandler` reads workspace context but only uses terminal IDs, rejects any terminal count other than one, and sends a static prompt from `src/runners/schema.ts: terminalPromptCommandSchema`. `test/runner.test.ts` proves the zero, one, and multiple-terminal behavior. `external:` parameterized task templates and fail-closed resource selection.
- Blast Radius & Reversibility: Surface | Two-Way Door. Static prompts and the current exactly-one policy remain the defaults.
- Value Impact: The worktree-review fixture must render branch, repository, and selected-path context without hand editing. Multi-terminal worktrees must either select explicitly or refuse before sending any text.
- Trade-off / Downside: Context tokens may expose local paths, and terminal pickers depend on Orca host capabilities. Limit tokens to an allowlist, add preview and redaction, and keep unsupported selection modes invalid.
- Implementation Blueprint:
  - Target Files / Symbols: `src/runners/schema.ts: terminalPromptCommandSchema`, `src/runners/orca-plugin.ts: workerHandler`, `runners/worktree-review.ts`, `test/runner.test.ts`, new `src/runners/template.ts`
  - Action: Add safe context tokens, `preview: true|false`, and an explicit terminal policy such as `only`, `focused`, or `named`. Resolve the policy before rendering or sending. Return stable errors for missing worktree, ambiguous terminal, disappeared terminal, and unavailable host.
  - Verification Probe: `bun test test/runner.test.ts`; fake zero, one, focused, named, and disappearing terminals, assert exact rendered text, and prove no `terminal.sendText` call occurs before a unique selection or during preview.

### 5. Give agents runner parity through MCP

- Axis & Priority: Agent-native operation | Medium/Medium, score 1.00
- Frames: Inversion / Removal / Automation; Leverage & Compounding; Constraint-Flipping
- Basis: `direct:` `src/runner-api.ts` already exports `polycastRunnerList` and `polycastRunnerBuild`, but `src/mcp/server.ts: createPolycastMcpServer` registers only command-oriented tools. `docs/agent-native/capability-map.md` claims CLI parity but omits runner operations. `external:` narrow capability APIs that separate artifact generation from installation.
- Blast Radius & Reversibility: Surface | Two-Way Door. The tools are additive and retain the build-only operator boundary.
- Value Impact: An agent must be able to discover and build runners through structured calls without shell parsing, repository mutation, Orca installation, or capability approval.
- Trade-off / Downside: A caller-supplied output path grants filesystem writes within the server process. Default to an isolated temporary directory and return its exact location and generated inventory.
- Implementation Blueprint:
  - Target Files / Symbols: `src/mcp/server.ts: createPolycastMcpServer`, `src/runner-api.ts: polycastRunnerList`, `src/runner-api.ts: polycastRunnerBuild`, `src/mcp/response.ts: toolError`, `test/mcp.test.ts`, `test/mcp-smoke.test.ts`, `docs/agent-native/capability-map.md`
  - Action: Register `polycast_runner_list`, `polycast_runner_inspect`, and `polycast_runner_build`. Return structured summaries and stable errors. Do not expose runner installation until the transactional lifecycle in Item 2 exists.
  - Verification Probe: `POLYCAST_SKIP_CHERRI=1 bun test test/mcp.test.ts test/mcp-smoke.test.ts test/runner.test.ts`; initialize MCP, list tools, build to a temporary directory, and assert no repository or Orca path changed.

### 6. Fail closed with a structured automation contract

- Axis & Priority: Agent-native operation | Medium/Large, score 0.67
- Frames: Pain & Friction; Inversion / Removal / Automation; Leverage & Compounding
- Basis: `direct:` `src/cli.ts: parseFlags` treats unknown flags as positional and retains defaults when value-taking flags omit a value. A direct probe showed `build --strcit` exited successfully and performed a non-strict build. Target IDs remain plain strings across `src/polycast-api.ts`, `src/mcp/server.ts`, and `src/registry.ts`. `src/mcp/response.ts: toolError` drops `PolycastError.code`. `external:` typed subcommand parsers and stable command result envelopes.
- Blast Radius & Reversibility: Surface | Two-Way Door. Human text remains the default while `--json` adds a stable automation format; previously ignored invalid flags become deliberate errors.
- Value Impact: Invalid options and targets must fail before loading definitions or creating output. CLI and MCP calls for the same operation must expose the same error code and result fields.
- Trade-off / Downside: Strict parsing can break scripts that relied on undocumented permissive behavior. Publish the rejected input in diagnostics and cover the `run --` separator contract.
- Implementation Blueprint:
  - Target Files / Symbols: `src/cli.ts: parseFlags`, `src/cli.ts: main`, `src/polycast-api.ts: PolycastError`, `src/registry.ts: emitters`, `src/mcp/response.ts: toolError`, `src/mcp/server.ts: createPolycastMcpServer`
  - Action: Derive a `TargetId` union from the registry, validate options before work begins, reject unknown and missing-value flags, add stable result and error envelopes, and support `--json` for list, build, apply, targets, and runner commands.
  - Verification Probe: `bun test test/polycast-wrapper.test.ts test/mcp.test.ts test/run.test.ts`; assert typos, missing values, and unknown targets exit nonzero with no output directory, while valid `run --` arguments remain byte-exact.

### 7. Make one schema authoritative at every command boundary

- Axis & Priority: Contract and test integrity | Medium/Large, score 0.67
- Frames: Pain & Friction; Assumption-Breaking; Leverage & Compounding
- Basis: `direct:` `src/types.ts: CommandDef` permits optional `args` for every modality; `src/schema/command-def.ts: commandDefSchema` adds runtime refinements; `schemas/command-def.schema.json` cannot express all documented refinements; `src/commands-store.ts: loadCommandJson` casts parsed JSON and calls the lighter `assertValid`. `src/load.ts: loadCommands` uses cached ESM imports inside a long-lived MCP process. `external:` parse-at-boundary design and discriminated unions.
- Blast Radius & Reversibility: Core | Two-Way Door with migration. Valid definitions keep their meaning, but malformed stored or authored definitions become explicit failures.
- Value Impact: The TypeScript authoring type, Zod parser, exported JSON Schema, MCP input, and stored JSON must agree on legal modality and argument states. Repeated MCP upsert then list/build calls must observe the newest module bytes.
- Trade-off / Downside: Stronger validation may reject tolerated files and versioned module imports can grow memory. Add a schema version and bounded reload mechanism.
- Implementation Blueprint:
  - Target Files / Symbols: `src/types.ts: CommandDef`, `src/schema/command-def.ts: commandDefSchema`, `src/define.ts: assertValid`, `src/commands-store.ts: loadCommandJson`, `src/load.ts: loadCommands`, `schemas/command-def.schema.json`
  - Action: Model modalities as a discriminated union, route every untrusted input through one parser, generate the public schema from that model, version stored definitions, and make module loading content-fresh in persistent MCP sessions.
  - Verification Probe: `bun test test/schema.test.ts test/run.test.ts test/mcp.test.ts`; reject malformed stored JSON before interpreter launch, validate the committed schema with an independent Draft 2020-12 validator, and prove same-process reload after three consecutive upserts.

### 8. Put every external effect behind a hermetic adapter

- Axis & Priority: Contract and test integrity | Medium/Large, score 0.67
- Frames: Pain & Friction; Inversion / Removal / Automation; Leverage & Compounding; Constraint-Flipping
- Basis: `direct:` `src/run.ts` hard-codes interpreter spawning, `src/post-build.ts: compileCherriArtifacts` resolves and launches Cherri, and `src/apply.ts: openShortcutForImport` launches macOS `open`. The suite globally sets `POLYCAST_SKIP_CHERRI=1`; real AppleScript coverage is platform-limited. The recent Shortcuts import regression required a one-off injected opener. `external:` ports-and-adapters testing and compiler conformance suites.
- Blast Radius & Reversibility: Core | Two-Way Door. Real adapters preserve current behavior while tests use fakes.
- Value Impact: CI must cover Cherri success and failure, every interpreter's argv and stdin, and every UI-capable action without starting applications. Adding an emitter or runner command kind must inherit the same conformance suite.
- Trade-off / Downside: Fakes can diverge from host tools. Retain a small macOS smoke lane for the real adapters and keep the majority deterministic.
- Implementation Blueprint:
  - Target Files / Symbols: `src/run.ts: executeCommand`, `src/post-build.ts: compileCherriArtifacts`, `src/apply.ts: ShortcutOpener`, `test/setup.ts`, `test/emitters.test.ts`, `test/runner.test.ts`, new `src/effects.ts`, new `test/conformance.test.ts`
  - Action: Define narrow process, tool-resolution, filesystem-publication, and UI-opening ports. Inject them at system boundaries. Build a modality by language by target fixture matrix that snapshots complete emitted paths, bytes, modes, markers, and host calls.
  - Verification Probe: `POLYCAST_SKIP_CHERRI=1 bun test test/conformance.test.ts test/emitters.test.ts test/run.test.ts test/runner.test.ts`; assert zero real `open`, Cherri, or interpreter processes under fakes, then run the repository's documented macOS adapter smoke separately.

## Tracker Export Manifest

```json
{
  "epic": "Ideation: Polycast command and runner expansion",
  "labels": ["ideation", "ce-ideate"],
  "tasks": [
    {
      "rank": 1,
      "title": "Make RunnerDef a target-neutral runner compiler",
      "priority": "P1",
      "impact": "High",
      "scope": "Large",
      "target_files": ["src/runners/schema.ts", "src/runner-api.ts", "src/runners/orca-plugin.ts", "src/cli.ts", "schemas/runner-def.schema.json"],
      "action": "Split runner intent from host emission and add a typed runner target registry with Orca and headless agent-CLI emitters.",
      "verification": "bun test test/runner.test.ts test/runner-schema.test.ts && POLYCAST_SKIP_CHERRI=1 bun run dev runner build --target orca-plugin,codex-cli --out build/runner-proof"
    },
    {
      "rank": 2,
      "title": "Publish and install from transactional state manifests",
      "priority": "P1",
      "impact": "High",
      "scope": "Large",
      "target_files": ["src/polycast-api.ts", "src/apply.ts", "src/runner-api.ts"],
      "action": "Stage and validate outputs, emit content manifests, preflight all destinations, and commit or roll back command and runner state as one declared plan.",
      "verification": "bun test test/operator-apply.test.ts test/cold-user.test.ts test/runner.test.ts"
    },
    {
      "rank": 3,
      "title": "Capture existing launcher and runner inventories",
      "priority": "P1",
      "impact": "High",
      "scope": "Large",
      "target_files": ["src/cli.ts", "src/command-source.ts", "src/schema/command-def.ts", "src/runners/schema.ts"],
      "action": "Add preview-first importers for Raycast exports and documented Orca inventory that produce definitions plus explicit loss and conflict reports.",
      "verification": "bun test test/importers.test.ts"
    },
    {
      "rank": 4,
      "title": "Add context-aware runners with explicit terminal selection",
      "priority": "P1",
      "impact": "High",
      "scope": "Large",
      "target_files": ["src/runners/schema.ts", "src/runners/orca-plugin.ts", "runners/worktree-review.ts", "test/runner.test.ts"],
      "action": "Add safe context tokens, preview, explicit terminal policies, and stable pre-send recovery errors.",
      "verification": "bun test test/runner.test.ts"
    },
    {
      "rank": 5,
      "title": "Give agents runner parity through MCP",
      "priority": "P2",
      "impact": "Medium",
      "scope": "Medium",
      "target_files": ["src/mcp/server.ts", "src/runner-api.ts", "src/mcp/response.ts", "test/mcp.test.ts", "test/mcp-smoke.test.ts"],
      "action": "Expose runner list, inspect, and build as structured MCP tools with temporary output by default and no installation authority.",
      "verification": "POLYCAST_SKIP_CHERRI=1 bun test test/mcp.test.ts test/mcp-smoke.test.ts test/runner.test.ts"
    },
    {
      "rank": 6,
      "title": "Fail closed with a structured automation contract",
      "priority": "P2",
      "impact": "Medium",
      "scope": "Large",
      "target_files": ["src/cli.ts", "src/polycast-api.ts", "src/registry.ts", "src/mcp/response.ts", "src/mcp/server.ts"],
      "action": "Reject invalid options and targets before work begins and return stable result and error envelopes through CLI JSON and MCP.",
      "verification": "bun test test/polycast-wrapper.test.ts test/mcp.test.ts test/run.test.ts"
    },
    {
      "rank": 7,
      "title": "Make one schema authoritative at every command boundary",
      "priority": "P2",
      "impact": "Medium",
      "scope": "Large",
      "target_files": ["src/types.ts", "src/schema/command-def.ts", "src/define.ts", "src/commands-store.ts", "src/load.ts", "schemas/command-def.schema.json"],
      "action": "Use one discriminated, versioned command contract for TypeScript, Zod, JSON Schema, stored JSON, and persistent MCP reloads.",
      "verification": "bun test test/schema.test.ts test/run.test.ts test/mcp.test.ts"
    },
    {
      "rank": 8,
      "title": "Put every external effect behind a hermetic adapter",
      "priority": "P2",
      "impact": "Medium",
      "scope": "Large",
      "target_files": ["src/run.ts", "src/post-build.ts", "src/apply.ts", "test/setup.ts", "test/emitters.test.ts", "test/runner.test.ts"],
      "action": "Inject process, tool, filesystem, and UI effect adapters and verify all modalities, languages, targets, and runner host calls without real applications.",
      "verification": "POLYCAST_SKIP_CHERRI=1 bun test test/conformance.test.ts test/emitters.test.ts test/run.test.ts test/runner.test.ts"
    }
  ]
}
```
