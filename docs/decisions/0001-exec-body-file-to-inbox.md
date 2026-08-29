# 0001. CommandDef exec body and file-to-Inbox ownership

- **Status:** accepted
- **Date:** 2026-08-29

## Context

Launcher shims already call `polycast run`. Substantive file-organization
behavior still does not belong in those shims, in Cherri source, or in
`RunnerDef`. Shortcuts also skipped the `files` modality, so a file command
could not reach Inbox from the share sheet without coercing paths into text.

## Decision

Polycast compiles adapters. A `CommandDef` may invoke a headless executable
with `body.lang: "exec"` plus `executable` and optional `args`. `polycast run`
spawns that program with the same modality argv/stdin contract as a script
body.

The file-to-Inbox command owns canonical destination (`POLYCAST_INBOX_DIR` or
`~/Inbox`), collision names, the Review Finder tag, structured receipts, and
recovery (copy, not move). Emitters stay thin `polycast run` shims.
`shortcuts-cherri` passes file paths as arguments, not newline-delimited text.

`RunnerDef` stays a separate compiler for portable runners. CommandDef does
not grow workflow or agent-lifecycle fields.

## Consequences

File-organization policy can change in `src/file-to-inbox.ts` without
regenerating launcher wrappers. A second exec-backed command can reuse the
body shape; there is no capability registry until a second shared program
needs one. Live Shortcut import, launcher install, user-file moves, and
manifest mutation remain operator-authorized steps outside this proof.
