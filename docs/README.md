# Documentation

| Path | Purpose |
|------|---------|
| `ARCHITECTURE.md` | Module map, the I/O modality contract, and key decisions. |
| `DESIGN.md` | The structural insight behind the IR, plus the roadmap. |
| `specs/` | Per-launcher format research and the destination mapping. |
| `guides/runner.md` | Portable RunnerDef authoring, target compatibility, and build-only output. |
| `verification/` | Operator and CI proof for `LAUNCH_CRITERIA.md`. |
| `decisions/` | Architecture Decision Records (ADRs). One file per decision, numbered. |
| `solutions/` | Captured solutions to non-obvious problems. |
| `lessons.md` | Running log of project learnings. |

## Conventions

- New architectural decision → copy `decisions/0000-template.md` to the next number.
- Keep docs close to the code they describe; link from `README.md` when user-facing.

Current adapter authority: [`decisions/0002-toolbox-adapter-contract.md`](decisions/0002-toolbox-adapter-contract.md).
