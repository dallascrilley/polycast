# Changelog

## Unreleased

### Added

- `CommandDef` `body.lang: "exec"` invokes a headless executable through
  `polycast run` without copying that logic into launcher shims.
- `file-to-inbox` copies files into Inbox with a Review tag and a structured
  receipt. Shortcuts now emit the files modality as argv, not newline text.

## [0.1.0] - 2026-08-26

### Added

- `RunnerDef` authoring and deterministic `runner list` / `runner build` output
  for Orca plugin bundles.
- User documentation for RunnerDef fields, build-only output, and the
  operator-controlled Orca installation and capability-consent boundary.
- Version-consistency and packed-package smoke checks in `script/cibuild`.

### Changed

- The package manifest is now the single version authority for runtime metadata,
  MCP server metadata, generated agent-cli metadata, and the committed sample
  runner.

### Boundary

- This release prepares local plugin bundles only. It does not install the Orca
  plugin, request or approve capabilities, publish npm, create a GitHub release,
  tag, or merge changes.
