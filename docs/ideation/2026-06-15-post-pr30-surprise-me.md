---
date: 2026-06-15
mode: surprise-me
subject: polycast after PR #30 (dogfood-level-a script)
td_run_label: ideation-post-pr30-2026-06-15
---

# Ideation — polycast after dogfood script

**Question:** What remains when CI + dogfood script cover everything except launcher UI?

## Survivors (ranked)

### 1. Operator Level A session (human gate)

**Basis:** `td-ff727f` in_progress; PopClip.app absent on dev machine; only unchecked launch rows.

**Effort:** S — one session via `docs/verification/level-a-dogfood.md`.

**Route:** manual; closes `td-ff727f` + `td-f6116a`.

### 2. Combined Level A doc + README status refresh

**Basis:** Three scattered checklists; README still said "Early skeleton".

**Effort:** XS — single dogfood doc + status line.

**Route:** docs PR (in flight).

### 3. Declare launch after Raycast-only A (split criterion)

**Basis:** Raycast B+ proven; PopClip optional for some operators.

**Effort:** S — LAUNCH_CRITERIA debate + product call.

**Route:** reject unless user relaxes P0-4 (PopClip is explicit in criterion).

### 4. Homebrew tap without npm

**Basis:** `td-060a1e` deferred; PATH story still operator-managed.

**Effort:** L.

**Route:** defer.

### 5. Screenshot capture helper in dogfood script

**Basis:** Level A wants screenshots; script could open verification doc paths.

**Effort:** S — `open docs/verification/level-a-dogfood.md` flag.

**Route:** optional polish after Level A done.

## Rejected

| Idea | Why |
|------|-----|
| More B+ tests | Diminishing returns — operator-apply covers dispatchers |
| npm publish | deferred 2026-09-01 |
| Automate PopClip UI | No API; requires installed app + GUI |

## Q1

1. **Run Level A session now** (recommended — only real blocker)
2. **Ship combined doc PR** then dogfood
3. **Homebrew tap spike**
4. Other
