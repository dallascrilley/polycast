---
date: 2026-06-15
mode: surprise-me
subject: polycast post-launch (board empty after td-b3ca50)
td_run_label: ideation-post-launch-2026-06-15
---

# Ideation — polycast post-launch

**Question:** What next now that MCP, thin-shim (Raycast/PopClip/Dropzone), P1-2 CI proof, and previewBuild shipped?

## Survivors (ranked)

### 1. Finish thin-shim: Dropover + Shortcuts

**Basis:** DESIGN roadmap — Dropover still inlined body until PR in flight; Shortcuts Cherri embeds source at compile time.

**Effort:** S (Dropover) / L (Shortcuts — Cherri `runShellScript` stub vs compile-time embed).

**Route:** Dropover in current PR; Shortcuts → `ce-plan`.

### 2. CommandDef JSON Schema for MCP clients

**Basis:** `polycast_command_upsert` uses loose JSON + runtime `assertValid`.

**Effort:** M — export schema, wire into MCP tool description or `$ref` file.

### 3. Sample command pack + forge doc

**Basis:** README points at `uppercase` / `open-repo` only; forge boundary documented but not walkthrough.

**Effort:** S — `docs/guides/first-command.md` + 2–3 opinionated examples.

### 4. Distribution (`polycast` on PATH)

**Basis:** Operator tests need `POLYCAST_BIN` wrapper; P1-2 runbook assumes install story.

**Effort:** M — npm bin, or Homebrew formula, or documented wrapper script in `script/polycast`.

### 5. Raycast/PopClip live UI verification log

**Basis:** P1-2 validated in CI; Level A optional for PopClip selection UX.

**Effort:** S — operator checklist like Dropzone section in verification doc.

## Rejected

| Idea | Why |
|------|-----|
| Dropover prefs automation | Research closed — opaque storage |
| Remote MCP HTTP | v1 non-goal |
| Cross-OS emitters | non-goal |

## Q1

1. **Shortcuts thin-shim plan** (recommended next engineering track)
2. **JSON Schema export**
3. **First-command guide + sample pack**
4. **Distribution / PATH story**
5. Other
