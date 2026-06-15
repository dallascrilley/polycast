# Verification logs

Operator and CI proof for `LAUNCH_CRITERIA.md`. Proof levels: **A** visual,
**B** behavioral, **C** structural.

| Log | Criterion | Level | Status |
|-----|-----------|-------|--------|
| [2026-06-14-first-run.md](./2026-06-14-first-run.md) | P0-1, P0-5 | B | validated |
| [2026-06-14-core-path.md](./2026-06-14-core-path.md) | P0-4 (script) | B | validated |
| [2026-06-15-popclip-raycast-ui.md](./2026-06-15-popclip-raycast-ui.md) | P0-4 (UI) | A + B | B validated; A pending |
| [2026-06-15-operator-apply.md](./2026-06-15-operator-apply.md) | P1-2 | B | validated (CI) |
| [2026-06-15-dropover-ui.md](./2026-06-15-dropover-ui.md) | Dropover apply | B + A | B validated; A pending |
| [2026-06-15-shortcuts-ui.md](./2026-06-15-shortcuts-ui.md) | P1-5 | B + A | B validated; A pending |
| [2026-06-15-mcp-smoke.md](./2026-06-15-mcp-smoke.md) | P1-4 | B | validated |

## Quick commands

```sh
./script/cibuild                              # full CI parity
bun test test/operator-apply.test.ts          # P1-2 + Dropover B proof
bun test test/mcp-smoke.test.ts               # MCP stdio
```

See [`LAUNCH_CRITERIA.md`](../../LAUNCH_CRITERIA.md) for the full matrix.
