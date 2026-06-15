---
date: 2026-06-15
origin: docs/DESIGN.md survivor #6, td-635ac9
td_task: td-635ac9
---

# Agent-native MCP command authoring

## Overview

Expose polycast CLI capabilities as MCP tools so agents can list, build, apply, run, and author `CommandDef` modules without shell improvisation. Polycast is already agent-shaped at the CLI layer (`polycast run`, JSON command store); MCP wraps existing functions rather than duplicating emit logic.

## Goals

- **Parity:** every CLI subcommand in `src/cli.ts` gets a documented MCP tool (see `docs/agent-native/capability-map.md`).
- **Safety:** default dry-run for `apply`; writes require explicit flag; command authoring validates via `assertValid` + optional `build --strict` preview.
- **Thin server:** stdio MCP in-repo (`src/mcp/` or `script/mcp-server`) calling shared libs (`load.ts`, `registry.ts`, `apply.ts`, `run.ts`).

## Non-goals

- Remote/hosted MCP service (local stdio only for v1)
- UI for Dropover/Raycast import (manual operator steps stay manual)
- Replacing forge for single-tool lifecycle

## Units

### U1 — Capability map + shared entrypoints

- **Files:** `docs/agent-native/capability-map.md` (done in this PR), refactor CLI handlers to importable functions if needed
- **Acceptance:** map matches CLI; `ce-work` can trace tool → function
- **Verify:** doc review

### U2 — MCP server scaffold

- **Files:** `src/mcp/server.ts`, `package.json` script `mcp`, deps `@modelcontextprotocol/sdk`
- **Acceptance:** server starts on stdio, exposes `polycast_targets` read-only tool
- **Verify:** manual MCP client smoke test

### U3 — Read tools: list + targets

- **Tools:** `polycast_list`, `polycast_targets`
- **Acceptance:** return same data as CLI (structured JSON)
- **Verify:** unit test calling handler functions

### U4 — Build + validate tool

- **Tool:** `polycast_build` with `strict` boolean, `targets` optional
- **Acceptance:** writes to temp dir by default; returns file list + validation issues
- **Verify:** test against sample `commands/`

### U5 — Apply + prune tools

- **Tools:** `polycast_apply`, `polycast_prune`
- **Acceptance:** `write: false` default; mirror CLI refusal/ownership behavior
- **Verify:** extend `test/emitters.test.ts` patterns or dedicated mcp handler tests

### U6 — Run tool

- **Tool:** `polycast_run` with `id`, `commandsDir`, modality args
- **Acceptance:** delegates to `executeCommand` in `src/run.ts`
- **Verify:** reuse `test/run.test.ts` fixtures

### U7 — Command authoring tool

- **Tool:** `polycast_command_upsert` — write/update `commands/<id>.ts` from JSON schema
- **Acceptance:** uses `defineCommand` template; rejects invalid IR; optional auto-build preview in response
- **Verify:** round-trip test: upsert → load → emit

### U8 — Docs + AGENTS.md

- **Files:** README MCP section, `PROJECT_CONTEXT.md` CLI list, capability-map status → implemented
- **Verify:** `script/cibuild` green

## Open questions

1. **MCP transport:** stdio-only vs optional HTTP for Cursor — default stdio.
2. **Command upsert format:** JSON `CommandDef` vs TypeScript source generation — prefer TS file emit for git-friendly diffs.
3. **Build output dir:** agent temp dir vs project `build/` — default temp unless `out` specified.

## References

- [docs/DESIGN.md](../DESIGN.md) — survivor #6
- [docs/agent-native/capability-map.md](../agent-native/capability-map.md)
- [AGENTS.md](../../AGENTS.md) — agent-native parity rule
