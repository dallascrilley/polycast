---
date: 2026-06-15
mode: surprise-me
subject: polycast post-MCP roadmap
td_run_label: ideation-post-mcp-2026-06-15
---

# Ideation — polycast after MCP (surprise me)

**Question:** What are the strongest next moves now that agent-native MCP (#9) is on `main`?

Grounding: `docs/DESIGN.md` roadmap, `LAUNCH_CRITERIA.md` P1 gaps, empty td board, eight emitters + `polycast run` dispatcher for agent-cli only.

## Survivors (ranked)

### 1. Extend thin-shim dispatcher to Raycast / PopClip / Dropzone

**Basis:** DESIGN survivor #3 — agent-cli stubs call `polycast run`; other emitters still inline full body. Body edits require re-apply to every surface.

**Why now:** MCP + JSON command store make remote body updates cheap; thin shims unlock single-source runtime for the highest-traffic launchers.

**Effort:** M — emitter changes + apply tests; no new targets.

**Route:** `ce-brainstorm` → `ce-plan` for emitter-by-emitter rollout.

---

### 2. P1-2 operator verification log (Dropzone + agent-cli)

**Basis:** `LAUNCH_CRITERIA.md` P1-2 still **missing**; only structural proof exists today.

**Why now:** Last honest launch gap before calling polycast “operator-ready” on a real Mac.

**Effort:** S — manual runbook + `docs/verification/` transcript; no code unless apply bugs found.

**Route:** operator task (Dallas machine) or `dogfood`-style scripted checklist.

---

### 3. MCP integration smoke doc + optional CI client test

**Basis:** Plan U2 acceptance was “manual MCP client smoke test”; README has config JSON but no verification artifact.

**Why now:** Agents are first-class users; prove tools work end-to-end without shell.

**Effort:** S–M — doc + lightweight test spawning stdio server and calling `polycast_targets`.

**Route:** `ce-plan` single unit.

---

### 4. Auto-build preview on `polycast_command_upsert`

**Basis:** Plan U7 acceptance mentioned “optional auto-build preview in response”; current tool returns preview TS only.

**Why now:** Agents authoring commands need immediate validation feedback without a second tool call.

**Effort:** S — call `polycastBuild` with temp dir when `previewBuild: true`.

**Route:** small feature PR.

---

### 5. Published CommandDef JSON Schema for MCP clients

**Basis:** `polycast_command_upsert` accepts loose JSON; `assertValid` errors are runtime-only.

**Why now:** Better agent UX — schema in tool description or `$ref` file reduces invalid upserts.

**Effort:** M — generate from TypeScript types or hand-maintained schema + test.

**Route:** `ce-brainstorm` on schema source of truth.

---

## Rejected (with reason)

| Idea | Why dropped |
|------|-------------|
| Remote HTTP MCP server | Plan non-goal; stdio sufficient for v1 |
| Dropover prefs automation | Research closed — storage opaque |
| npm publish / Homebrew formula | No distribution story yet; README dev-first |
| Cross-OS emitters | Explicit non-goal in DESIGN |
| Replace forge entirely | Forge boundary documented; polycast syncs, forge promotes |

## Q1 — pick one to deepen

1. **Thin-shim extension** (recommended — architectural payoff)
2. **P1-2 operator verification** (launch honesty)
3. **MCP smoke test + doc** (agent parity proof)
4. **Upsert auto-build preview** (quick agent DX win)
5. **Something else** — specify
