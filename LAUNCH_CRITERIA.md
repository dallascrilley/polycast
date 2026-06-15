# Launch criteria — polycast

Minimum bar for calling polycast **launchable** for macOS operators who maintain
personal launcher automation (Raycast, PopClip, Dropzone, Shortcuts, agent CLIs).

Proof levels:

- **A — Visual:** screenshot, video, or comparable UI evidence in a launcher.
- **B — Behavioral:** reproducible manual log, CLI transcript, or integration test.
- **C — Structural:** code, route, or unit test exists (insufficient alone for UI flows).

Last reviewed: 2026-06-14

## P0 — must pass before launch

| ID | Criterion | Proof | Status |
|----|-----------|-------|--------|
| P0-1 | CLI surfaces `list`, `build`, `targets`, and `apply` work from README quickstart | B | partial — `list`/`build`/`targets`/`apply` dry-run verified in CI; full operator walkthrough pending (see U5) |
| P0-2 | Eight emitters registered; incompatible modalities skip (never mis-emit) | C + B | partial — 16 unit tests + `build --strict` in CI (C); live launcher run pending (B) |
| P0-3 | `script/cibuild` passes on CI (lint, typecheck, test, dist build, `dev build --strict`) | B | validated — `POLYCAST_SKIP_CHERRI=1` on ubuntu runners |
| P0-4 | Sample commands (`uppercase`, `open-repo`) install via `apply --write` and run in PopClip + Raycast | B | validated — see `docs/verification/2026-06-14-core-path.md` (script-level; launcher UI optional follow-up) |
| P0-5 | README first-run path reproducible without maintainer help | B | missing — walkthrough doc or README update required |

## P1 — soon after launch

| ID | Criterion | Proof | Status |
|----|-----------|-------|--------|
| P1-1 | License chosen and recorded in README | C | missing (`README.md` TODO) |
| P1-2 | Dropzone + agent-cli `apply --write` verified on operator machine | B | missing |
| P1-3 | Shortcuts artifact import documented when Cherri absent | B | partial — skip path documented in specs; first-run note pending |

## Explicit non-goals for v1 launch

- Thin-shim `polycast run <id>` dispatcher
- Dropover programmatic import (staging + manual import is acceptable)
- Agent-native MCP command authoring
- Cross-OS launcher targets

## References

- Core value path: `docs/whats-next/2026-06-14.md`
- Platform mapping: `docs/specs/destination-mapping.md`
- Launch readiness plan: `docs/plans/2026-06-14-feat-launch-readiness-plan.md`
