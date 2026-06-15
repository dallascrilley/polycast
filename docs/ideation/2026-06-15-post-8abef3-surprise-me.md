---
date: 2026-06-15
mode: surprise-me
subject: polycast post-td-8abef3 (epic closed)
td_run_label: ideation-post-8abef3-2026-06-15
---

# Ideation — polycast after post-cac272 epic

**Question:** What next now that Shortcuts thin-shim, MCP schema hints, and P0-4
verification checklist shipped?

## Survivors (ranked)

### 1. npm global publish story — **deferred**

**Basis:** `package.json` has `bin`; README documents `bun link` + `script/polycast`
but no npm install path for non-cloners.

**Effort:** M — publish workflow, version policy, CI release job, README install section.

**Route:** ce-plan when ready; **deferred 2026-06-15** — `script/polycast` + `bun link` enough for v1 operators.

### 2. Dropover end-to-end operator log

**Basis:** Dropover thin-shim shipped (#14); verification docs cover Dropzone P1-2
and PopClip/Raycast P0-4 but not Dropover staging + manual import.

**Effort:** S — `docs/verification/2026-06-15-dropover-ui.md` + isolated apply test.

**Route:** docs + optional operator test mirroring P0-4 pattern.

### 3. Shortcuts Level A UI verification

**Basis:** Shortcuts thin-shim validated in CI (B); no Level A checklist like
PopClip/Raycast P0-4 doc.

**Effort:** S — operator checklist with `cherri` compile + import + JSON edit proof.

**Route:** docs/verification + LAUNCH_CRITERIA row if needed.

### 4. CI cherri compile isolation

**Basis:** Local test flake when parallel tests spawn `cherri` (emitters apply
dry-run timeout at 5s).

**Effort:** S — serialize cherri post-build or enforce `POLYCAST_SKIP_CHERRI=1` in
test harness default.

**Route:** test helper / env in `script/test`.

### 5. Sample command: `copy-path` (text → clipboard)

**Basis:** Sample pack covers three modalities; no clipboard/utility example for
PopClip share sheet demos.

**Effort:** S — one command + guide cross-link.

**Route:** direct PR.

## Rejected

| Idea | Why |
|------|-----|
| Remote MCP HTTP | v1 non-goal |
| Dropover prefs automation | Research closed |
| Replace Cherri | settled |

## Q1

1. **Dropover operator verification log** (recommended next)
2. **Shortcuts UI verification checklist**
3. **CI cherri test isolation**
4. **npm global publish** (deferred)
5. Other
