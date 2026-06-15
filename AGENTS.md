# AGENTS.md — polycast

Agent-facing contract for this repo. Human docs live in `README.md`; project
facts live in `PROJECT_CONTEXT.md`.

## Commands (use these, not raw tooling)

This project follows **Scripts to Rule Them All** — `script/*` are the canonical
entrypoints, and `just <recipe>` is a thin alias for each.

| Task | Command | `just` |
|------|---------|--------|
| Install toolchain | `script/bootstrap` | `just bootstrap` |
| Get runnable | `script/setup` | `just setup` |
| Refresh after pull | `script/update` | `just update` |
| Run locally | `script/server` | `just server` |
| Run tests | `script/test` | `just test` |
| What CI runs | `script/cibuild` | `just cibuild` |
| Level A dogfood prep | `script/dogfood-level-a` | `just dogfood-level-a` |
| REPL / console | `script/console` | `just console` |

`script/cibuild` is the single source of truth for CI — if it passes locally, CI passes.

## Stack

Node.js / TypeScript (bun)

## Git & PR standards (universal)

- **Branches:** never commit directly to `main`; branch as `type/short-slug`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org) —
  `type(scope): summary`. Types: `feat, fix, refactor, docs, test, chore, perf, ci`.
- **PRs:** fill `.github/PULL_REQUEST_TEMPLATE.md`; keep them small and focused;
  `script/cibuild` must pass before requesting review.
- **Secrets:** never commit secrets. Use env vars / a secret manager. `.env` is gitignored.

## Working agreement

- Make the smallest maintainable change that satisfies the task; match existing patterns.
- Validate before claiming done: run `script/test` (or `script/cibuild`) and read the result.
- Update `docs/` (ADR in `docs/decisions/`, learnings in `docs/lessons.md` and
  `docs/solutions/`) when behavior or architecture changes.
- **Agent-native parity:** when this project is agent-native, every new UI action gets a
  corresponding agent tool in the same change; update `docs/agent-native/capability-map.md`.

## Task Tracking (td)

Applies when this repo is td-initialized (`.todos/` present). Bootstrap runs
`td init` when missing.

- **Session start:** `td usage --new-session`
- **Capture first:** record tasks, bugs, and ideas in td before editing — the
  tracker, not chat, is the source of truth.
- **While working:** `td start` before edits; `td log --decision` for choices;
  `td block --reason` when stuck.
- **Before exit:** hand off in-progress items and run `td check-handoff`.
- **Full workflow:** `td-task-management` skill.

## Knowledge routing

- Search `docs/solutions/` before debugging recurring issues:
  `grep -ril "<terms>" docs/solutions/`
- Capture non-obvious fixes via `ce-compound` → `docs/solutions/<category>/`
- Maintain stale solution docs via `ce-compound-refresh`

## Recommended agents & skills

These live in the shared agent hub and are referenced (not vendored) by default.
Run `project-bootstrap --vendor` to copy local snapshots into `.claude/` for a
self-contained repo.

- **Agents:** `code-reviewer`, `architect`, `tdd-guide`, `e2e-runner`, `doc-updater`
- **Skills:** `prime`, `library`, `handoff`, `git` (commit / PR / PR-comments),
  `td-task-management`, `subagent-driven-development`, `secrets-management`,
  `prompt-optimizer`, `docs-lifecycle` (generate/audit project docs)

Use `/library load <id>` for on-demand hub skills. **Project-relevant skills**
discovered during bootstrap are appended below this baseline as a
`### Project-relevant skills` subsection (structured entries with path and load command).

### Project-relevant skills

- **`create-cli`** — Design CLI parameters, subcommands, help text, exit codes, and dry-run behavior.
  - **Why this project:** polycast grows via `list` / `build` / `targets` (and future `apply`); each new emitter and flag needs a consistent, composable surface.
  - **Path:** `~/.hub/artifacts/skills/create-cli/source/original/SKILL.md`
  - **Load:** `/library load create-cli`

- **`ast-grep`** — Structural code search via AST patterns (beyond text grep).
  - **Why this project:** emitter registry + `CommandDef` IR benefit from pattern queries across `src/emitters/*` and `commands/*.ts` when adding targets or refactoring the modality contract.
  - **Path:** `~/.hub/artifacts/skills/ast-grep/source/original/SKILL.md`
  - **Load:** `/library load ast-grep`

- **`bun-executable-cli`** — Turn TS entrypoints into Bun standalone executables.
  - **Why this project:** ship `polycast` as a single binary for Raycast/PopClip install paths without requiring a global bun runtime.
  - **Path:** `~/.hub/artifacts/skills/bun-executable-cli/source/original/SKILL.md`
  - **Load:** `/library load bun-executable-cli`
