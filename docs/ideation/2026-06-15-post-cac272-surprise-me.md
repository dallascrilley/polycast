---
date: 2026-06-15
mode: surprise-me
subject: polycast post-td-cac272 (board empty)
td_run_label: ideation-post-cac272-2026-06-15
---

# Ideation — polycast after post-launch epic

**Question:** What next now that JSON Schema, first-command guide, Shortcuts plan,
and PATH wrapper shipped (td-cac272 closed)?

## Survivors (ranked)

### 1. Implement Shortcuts Cherri thin-shim (ce-work plan)

**Basis:** Ready plan at `docs/plans/2026-06-15-feat-shortcuts-cherri-thin-shim-plan.md`;
LAUNCH_CRITERIA still lists shortcuts inline body as post-launch gap.

**Effort:** M — U1–U5 in plan (shim helpers, emitter refactor, DISPATCHER_TARGETS, tests, docs).

**Route:** `ce-work` the plan directly.

### 2. Close P0-4 launcher UI verification gap

**Basis:** LAUNCH_CRITERIA P0-4 still **partial** — script proof only; PopClip/Raycast UI optional.

**Effort:** S — operator checklist + screenshots in `docs/verification/` (Level A).

**Route:** Manual dogfood session; update LAUNCH_CRITERIA row.

### 3. npm publish / install story beyond dev clone

**Basis:** `package.json` has `bin`; `bun link` documented but no global install path for non-devs.

**Effort:** M — npm publish workflow, version bump, `npm install -g`, CI release job.

**Route:** ce-plan if scope includes registry auth; else chore PR for publish docs only.

### 4. MCP tool: expose JSON Schema inline

**Basis:** `schemas/command-def.schema.json` committed; MCP clients still fetch from repo.

**Effort:** S — embed schema summary or `$schema` URL in `polycast_command_upsert` tool description.

**Route:** Small feat PR.

### 5. Dropover end-to-end operator log

**Basis:** Dropover thin-shim shipped (#14); verification doc focuses Dropzone/agent-cli P1-2.

**Effort:** S — staging + import checklist like existing Dropover import note test.

**Route:** docs/verification + optional operator test.

## Rejected

| Idea | Why |
|------|-----|
| Remote MCP HTTP | v1 non-goal |
| Cross-OS emitters | non-goal |
| Replace Cherri with raw plist | Research closed — Cherri is the path |
| Full Homebrew formula now | PATH wrapper sufficient until npm publish lands |

## Q1

1. **Implement Shortcuts thin-shim** (recommended — plan ready)
2. **P0-4 UI verification log**
3. **npm global publish story**
4. **MCP schema in tool description**
5. Other
