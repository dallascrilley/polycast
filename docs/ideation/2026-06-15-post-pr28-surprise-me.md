---
date: 2026-06-15
mode: surprise-me
subject: polycast after PR #28 (P0-4 B+ + MCP schemaPath)
td_run_label: ideation-post-pr28-2026-06-15
---

# Ideation — polycast after PR #28

**Question:** What next when P0/P1 behavioral proof is largely CI-covered but Level A UI
sign-off remains manual?

## Survivors (ranked)

### 1. Combined Level A dogfood session (operator)

**Basis:** `td-ff727f` open; P0-4 + P1-5 + Shortcuts checklists all have unchecked Level A rows;
Raycast/PopClip/Shortcuts not automatable in ubuntu CI.

**Effort:** S — one macOS session, three verification docs, screenshots.

**Route:** manual; close `td-ff727f` + epic `td-f6116a` when done.

### 2. P1-5 B+ operator apply test

**Basis:** Shortcuts verification doc listed operator-apply gap; PopClip/Raycast got P0-4 B+ in PR #28.

**Effort:** S — mirror apply + JSON edit in `test/operator-apply.test.ts`.

**Route:** feat PR (in flight).

### 3. `script/dogfood-level-a` helper

**Basis:** Three verification logs repeat isolated install env vars; operator friction.

**Effort:** S — shell script prints env + build/apply commands + checklist links.

**Route:** docs/script PR.

### 4. LAUNCH_CRITERIA refresh after B+

**Basis:** P0-4 row still read as “B only” before LAUNCH_CRITERIA edit.

**Effort:** XS — one table row.

**Route:** docs (bundled with #2).

### 5. Homebrew tap (no npm)

**Basis:** `td-060a1e` npm deferred; operators still need PATH story beyond `script/polycast`.

**Effort:** L — formula, optional bottle CI.

**Route:** defer unless distribution is priority.

## Rejected

| Idea | Why |
|------|-----|
| npm publish | deferred to 2026-09-01 |
| Dropover prefs automation | closed research |
| Re-open MCP schemaPath | shipped PR #28 |

## Q1

1. **Combined Level A dogfood** (recommended — unblocks launch criterion A)
2. **`script/dogfood-level-a` helper**
3. **Homebrew tap spike**
4. Other
