---
title: GitHub Actions CI defaults baked into this project
date: 2026-06-14
category: workflow
module: ci
tags: [github-actions, ci, concurrency, caching, paths-filter]
severity: medium
---

# GitHub Actions CI defaults baked into this project

## Why these defaults are here

`.github/workflows/ci.yml` was scaffolded with a few defaults that are easy to
forget and annoying to retrofit. CI runs the same entrypoint as local dev
(`./script/cibuild`) so the two can never drift; the rest is cost and
correctness hygiene from BASE.md's "CI & GitHub Actions" rules.

### `concurrency` + `cancel-in-progress: true`
Keyed on `${{ github.workflow }}-${{ github.ref }}`. When you push twice in a
row, the first (now-stale) run is cancelled instead of running to completion.
Without it you pay for runs whose result no one will read.

### `fetch-depth: 2` on checkout
A `push` event needs the previous commit to compute a diff. The default shallow
clone (`fetch-depth: 1`) has no parent, so any "what changed?" step is wrong or
empty. Depth 2 is the cheapest clone that still diffs; the path filter below
depends on it.

### `dorny/paths-filter` change signal (wired, non-gating)
Exposes `steps.changes.outputs.*` so you can add cheaper, path-scoped follow-up
steps (e.g. skip a heavy job when only docs changed). It does **not** gate
`./script/cibuild` — that stays the single correctness gate and runs every time.
Consume the outputs to add conditional steps; never make cibuild conditional.

### `workflow_dispatch`
A manual "Run workflow" button for re-running CI without an empty commit.

### `timeout-minutes`
Every job sets one so a hung step can't silently burn your Actions budget.

### Dependency caching
- **node:** `setup-node`'s `cache:` input only accepts `npm|yarn|pnpm`, so with
  bun we cache bun's global install store (`~/.bun/install/cache`) via
  `actions/cache` keyed on the lockfile. Bump the `v1-` key prefix to bust a
  poisoned cache.
- **python:** `astral-sh/setup-uv` with `enable-cache: true` — uv's own
  lockfile-aware cache, not a `setup-python` `cache:` (which would key on pip
  and miss uv-managed deps).

## Tuning

These are sensible starting points, not tuned numbers. To optimize CI wall-clock
or cost against real run data, use the `ce-optimize` skill (read per-step timings
with `gh run view --json jobs` and billing before changing anything).
