# Launch criteria — polycast

Minimum bar for calling polycast **launchable** for macOS operators who maintain
personal launcher automation (Raycast, PopClip, Dropzone, Shortcuts, agent CLIs).

Proof levels:

- **A — Visual:** screenshot, video, or comparable UI evidence in a launcher.
- **B — Behavioral:** reproducible manual log, CLI transcript, or integration test.
- **C — Structural:** code, route, or unit test exists (insufficient alone for UI flows).

Last reviewed: 2026-06-15

## P0 — must pass before launch

| ID | Criterion | Proof | Status |
|----|-----------|-------|--------|
| P0-1 | CLI surfaces `list`, `build`, `targets`, and `apply` work from README quickstart | B | validated — see `docs/verification/2026-06-14-first-run.md` |
| P0-2 | Eight emitters registered; incompatible modalities skip (never mis-emit) | C + B | validated — unit tests + `build --strict` in CI |
| P0-3 | `script/cibuild` passes on CI (lint, typecheck, test, dist build, `dev build --strict`) | B | validated — `POLYCAST_SKIP_CHERRI=1` on ubuntu runners |
| P0-4 | Sample commands (`uppercase`, `open-repo`) install via `apply --write` and run in PopClip + Raycast | B + A | partial — B/B+ validated; Level A via [`docs/verification/level-a-dogfood.md`](docs/verification/level-a-dogfood.md) + `script/dogfood-level-a` |
| P0-5 | README first-run path reproducible without maintainer help | B | validated — see `docs/verification/2026-06-14-first-run.md` |

## P1 — soon after launch

| ID | Criterion | Proof | Status |
|----|-----------|-------|--------|
| P1-1 | License chosen and recorded in README | C | validated — MIT in README and LICENSE |
| P1-2 | Dropzone + agent-cli `apply --write` verified on operator machine | B | validated — `test/operator-apply.test.ts` (temp install); live Dropzone UI optional |
| P1-3 | Shortcuts artifact import documented when Cherri absent | B | validated — README + specs document `.cherri` emit and skip path |
| P1-4 | Agent-native MCP documented and smoke-testable from README | B | validated — README MCP section + capability map (PR #9); manual Cursor hook optional |
| P1-5 | Shortcuts Cherri thin-shim delegates to `polycast run` + commands JSON sync on apply | B + A | validated (B/B+) — Level A via [`docs/verification/level-a-dogfood.md`](docs/verification/level-a-dogfood.md) |

## Explicit non-goals for v1 launch

- Dropover programmatic import (staging + manual import is acceptable)
- Cross-OS launcher targets

## References

- Core value path: `docs/whats-next/2026-06-14.md`
- Platform mapping: `docs/specs/destination-mapping.md`
- Launch readiness plan: `docs/plans/2026-06-14-feat-launch-readiness-plan.md`
