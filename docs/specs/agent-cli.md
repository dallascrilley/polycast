# Agent CLI target

**Fetched:** 2026-06-14
**Source:** polycast DESIGN, [forge hub skill](~/.hub/artifacts/skills/forge)

## Purpose

Standalone executable per command for terminal and agent use. Compatible with `forge wrap` for promotion to `~/.agents/tools/`.

## Output layout

```
build/agent-cli/<id>              # mode 755 executable
build/agent-cli/<id>.polycast-meta.json
```

Meta sidecar:

```json
{
  "id": "uppercase",
  "title": "Uppercase",
  "modality": "text",
  "polycastVersion": "0.0.1"
}
```

## I/O contract

| Modality | Invocation |
|----------|------------|
| `text` | stdin or `--text "..."` |
| `files` | paths as trailing arguments |
| `args` | positional args per `CommandDef.args` |
| `none` | no input |

All emit `--help` with title and description.

## Install (apply)

Symlink or copy into directory on PATH (default `~/.agents/tools/` or `POLYCAST_AGENT_BIN`).

## Forge boundary

polycast emits artifacts; `forge wrap build/agent-cli/<id> --dest agents` is optional post-step for forge-managed lifecycle. polycast `apply` handles multi-target sync without replacing forge for ad-hoc single tools.
