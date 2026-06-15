---
date: 2026-06-15
mode: surprise-me
subject: polycast post-td-f5da0e (verification epic closed)
td_run_label: ideation-post-f5da0e-2026-06-15
---

# Ideation — polycast after verification epic

**Question:** What next now that Dropover/Shortcuts verification checklists and
test Cherri isolation shipped?

## Survivors (ranked)

### 1. Close P0-4 Level A (operator sign-off)

**Basis:** P0-4 still **partial** — PopClip/Raycast UI checklist exists but
checkboxes unchecked.

**Effort:** S — one dogfood session + screenshots in verification doc.

**Route:** manual; no code.

### 2. Sample command: `copy-to-clipboard` (text modality)

**Basis:** Sample pack has uppercase/open-repo/basename-files; no clipboard demo
for PopClip/Shortcuts share sheet.

**Effort:** S — one `commands/*.ts` + guide link.

**Route:** direct PR.

### 3. MCP `polycast_command_upsert` return schema URL in response

**Basis:** Tool description now documents schema; response could include
`schemaPath` on preview for agent clients.

**Effort:** S — API + one test.

**Route:** feat PR.

### 4. Homebrew tap (without npm publish)

**Basis:** npm publish deferred; Homebrew could wrap `script/polycast` + bun dep.

**Effort:** L — formula + CI bottle optional.

**Route:** defer unless user wants distribution.

### 5. `docs/verification/README.md` index

**Basis:** Six verification logs scattered; no single operator index.

**Effort:** S — index table linking all logs + proof levels.

**Route:** docs PR.

## Rejected

| Idea | Why |
|------|-----|
| npm publish | deferred to 2026-09-01 |
| Dropover prefs automation | research closed |

## Q1

1. **Verification index README** (recommended — low risk, high navigability)
2. **P0-4 Level A dogfood** (manual)
3. **copy-to-clipboard sample command**
4. **MCP upsert schema in response**
5. Other
