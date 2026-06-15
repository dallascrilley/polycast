---
date: 2026-06-14
origin: docs/whats-next/2026-06-14.md
td_epic: td-2fe34f
---

# Launch readiness — ship destination emitters and prove core path

**Summary:** Destination emitters (U1–U10 from `docs/plans/2026-06-14-feat-destination-emitters-plan.md`) are implemented locally but unmerged on `main`. This plan finishes the **finish** track from `docs/whats-next/2026-06-14.md`: land the WIP via PR, extend CI to gate emitter output, define a launch contract, and produce Level B proof on Raycast + PopClip.

## Requirements

- R1. Merge destination emitters WIP (8 targets, validation, `apply`) to `main` so README/DESIGN claims match shipped code.
- R2. CI (`script/cibuild`) gates emitter correctness, not only CLI bundle + unit tests.
- R3. `LAUNCH_CRITERIA.md` defines 3–5 P0 criteria with assigned proof levels (A/B/C).
- R4. Level B verification log proves `uppercase` (PopClip) and `open-repo` (Raycast) after `build` + `apply --write`.
- R5. README quickstart is reproducible for a new operator through `build --strict`.
- R6. Tracker reflects reality: close `td-34aff0` after merge; defer F1–F4 follow-ups with rationale.

## Key technical decisions

- **Separate PR from CI-docs branch** — current branch `docs/ci-paths-filter-permission` has an unrelated docs commit; emitter WIP lands on `feat/destination-emitters` branched from `main` (or rebased) to keep review focused.
- **Cherri skipped in CI** — `src/post-build.ts` already skips when `POLYCAST_SKIP_CHERRI=1` or `cherri` absent; set env in CI cibuild step per `docs/research/2026-06-14-destination-emitters-findings.md`. Do not require macOS Shortcuts tooling on ubuntu runners.
- **Extend `run_cibuild`, not replace it** — add `POLYCAST_SKIP_CHERRI=1 bun run dev build --strict` after existing `bun test`; keep `bun run build` (CLI dist bundle) unchanged.
- **Launch contract before over-proofing** — draft P0 criteria in U3; U4 fills proof artifacts against those criteria rather than inventing ad hoc checks.
- **Manual apply proof is acceptable v1** — Level B via dated verification doc; no Playwright for launcher UIs in this plan.
- **CI permissions learning applied** — `docs/solutions/workflow/github-actions-ci-defaults.md`: keep `pull-requests: read` on workflow; do not gate `script/cibuild` on paths-filter.

## Implementation units

### U1. Extend cibuild to gate emitter build --strict

- **Goal:** `script/cibuild` fails if emitters break, Cherri absent on CI is non-fatal, and local dev unchanged.
- **Requirements:** R2
- **Files:** `script/lib/profile.sh`, `.github/workflows/ci.yml` (optional explicit env on cibuild step), `docs/solutions/workflow/github-actions-ci-defaults.md` (note if env documented)
- **Approach:** Append to `run_cibuild`: `POLYCAST_SKIP_CHERRI=1 bun run dev build --strict`. Optionally add `bun run typecheck` if not already implied. Do not make paths-filter gate cibuild.
- **Tests:** CI step passes on ubuntu with Cherri absent; local `script/cibuild` passes with WIP tree; intentional emitter break fails `--strict`.
- **Verification:** `./script/cibuild` exit 0 on feature branch.

### U2. Land destination emitters on main via focused PR

- **Goal:** All emitter WIP (registry, apply, validate, specs, tests, docs) merged to `main`.
- **Requirements:** R1
- **Files:** `src/emitters/*`, `src/apply.ts`, `src/validate/*`, `src/cli.ts`, `src/registry.ts`, `src/types.ts`, `src/wrappers.ts`, `src/post-build.ts`, `src/constants.ts`, `commands/basename-files.ts`, `test/emitters.test.ts`, `README.md`, `docs/DESIGN.md`, `docs/specs/**`, `docs/research/**`, `PROJECT_CONTEXT.md` (if drift)
- **Approach:** Branch `feat/destination-emitters` from `main`. Commit WIP in 1–2 logical commits (implementation + docs/specs). Exclude unrelated `docs/ci-paths-filter-permission` delta unless already on main. Open PR; ensure U1 is included or merged first. Fill PR template with `script/cibuild` evidence.
- **Tests:** Post-merge `bun test`, `bun run lint`, `bun run typecheck`, `POLYCAST_SKIP_CHERRI=1 bun run dev build --strict`.
- **Verification:** PR merged; `git show main:src/registry.ts` lists 8 emitters.

### U3. Write LAUNCH_CRITERIA.md with P0 proof levels

- **Goal:** Launch contract exists; each P0 names proof level and current validation status.
- **Requirements:** R3
- **Files:** `LAUNCH_CRITERIA.md` (new), cross-ref `README.md`, `docs/DESIGN.md`
- **Approach:** Draft 3–5 P0 items from north star path: (1) `list`/`build`/`targets`/`apply` CLI surfaces, (2) eight emitters with modality skip, (3) `build --strict` clean, (4) `apply --write` on Raycast + PopClip for sample commands, (5) README quickstart reproducible. Tag each P0 with proof level and status (`validated` / `partial` / `missing`).
- **Tests:** N/A (doc); peer review that every README promise maps to a P0 or explicit non-P0.
- **Verification:** File exists; no P0 left without proof level assignment.

### U4. Prove core path on Raycast and PopClip

- **Goal:** Level B verification log for `uppercase` + `open-repo` after real `apply --write`.
- **Requirements:** R4
- **Files:** `docs/verification/2026-06-14-core-path.md` (new), update `LAUNCH_CRITERIA.md` statuses
- **Approach:** On macOS dev machine: `bun run dev build --target popclip,raycast-script` then `apply --write --target popclip,raycast-script`. Record env vars (`POLYCAST_RAYCAST_DIR`, etc.), commands, expected vs observed behavior. PopClip: select text → Uppercase action. Raycast: run Open Code Repo with arg.
- **Tests:** Manual only; document repro steps so another operator can repeat.
- **Verification:** Verification doc committed; LAUNCH_CRITERIA P0 for apply proof marked `validated`.

### U5. Validate README first-run and close onboarding gaps

- **Goal:** New operator can `script/setup` → `dev list` → `dev build --strict` without tribal knowledge.
- **Requirements:** R5
- **Files:** `README.md`, optional `docs/verification/2026-06-14-first-run.md`
- **Approach:** Walk README quickstart verbatim (fresh clone or clean worktree). Document `POLYCAST_SKIP_CHERRI` for machines without Cherri. Fix README if steps missing. Note `script/setup` vs `script/bootstrap` if confusing.
- **Tests:** Walkthrough log shows success path; any skip env vars documented in README Development section.
- **Verification:** First-run doc or README update committed; LAUNCH_CRITERIA onboarding P0 updated.

### U6. Close destination-emitters epic and defer follow-ups

- **Goal:** `td-34aff0` closed with merge SHA; F1–F4 remain open with explicit defer rationale.
- **Requirements:** R6
- **Files:** td epic `td-34aff0` log only
- **Approach:** After U2 merge: `td close td-34aff0` with PR reference. Log decision on `td-88eb8d`, `td-5b9d3a`, `td-84b163`, `td-635ac9` — deferred until launch P0s validated. Align whats-next run label tasks (`td-096617`, `td-7977ec`, `td-370694`, `td-a7791b`) to closed or link to units.
- **Tests:** `td tree td-34aff0` shows children closed; follow-ups still open.
- **Verification:** Epic closed; whats-next tagged tasks reflect completion.

## Prior learnings applied

- `docs/solutions/workflow/github-actions-ci-defaults.md` — keep `pull-requests: read`; never gate `script/cibuild` on paths-filter; cibuild stays sole correctness gate.

## Deferred / out of scope

- Thin-shim `polycast run <id>` dispatcher (`td-84b163`).
- Dropover programmatic import (`td-88eb8d`).
- Cherri args modality (`td-5b9d3a`).
- Agent-native MCP authoring (`td-635ac9`).
- License selection (`README.md` TODO) — note in LAUNCH_CRITERIA as P1 unless user elevates.
- Automated e2e for launcher UIs.

## Open questions

- **Q1 (U2):** Single PR vs split (emitters code vs docs/specs)? Default: one PR if reviewable; split if diff exceeds ~500 lines of logic.
- **Q2 (U4):** Use default `POLYCAST_RAYCAST_DIR` (dotfiles path) or isolated test dir? Default: document actual paths used; prefer non-destructive test dir if operator lacks dotfiles layout.

## whats-next task mapping

| Unit | whats-next td |
|------|----------------|
| U1–U2 | `td-096617` |
| U3 | `td-7977ec` |
| U4 | `td-370694` |
| U5 | `td-a7791b` |
| U6 | `td-34aff0` |
