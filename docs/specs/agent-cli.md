# Agent CLI target

**Fetched:** 2026-06-14
**Source:** polycast DESIGN, [forge hub skill](~/.hub/artifacts/skills/forge)

## Purpose

Standalone executable per command for terminal and agent use. Compatible with `forge wrap` for promotion to `~/.agents/tools/`.

## Output layout

```
build/commands/<id>.json        # runtime IR for polycast run
build/agent-cli/<id>            # mode 755 dispatcher stub
build/agent-cli/<id>.polycast-meta.json
```

Apply syncs `build/commands/*.json` to `~/.polycast/commands/` (or `POLYCAST_COMMANDS_DIR`) when installing agent-cli targets.

## Dispatcher stub

Each executable delegates to the polycast CLI:

```bash
exec polycast run --commands "$POLYCAST_COMMANDS_DIR" <id> "$@"
```

Edit command bodies in `commands/*.ts`, run `build`, re-apply JSON (or copy to `~/.polycast/commands/`) — stubs stay unchanged.

## Meta sidecar

```json
{
  "id": "uppercase",
  "title": "Uppercase",
  "modality": "text",
  "polycastVersion": "<package version>",
  "dispatcher": "polycast run"
}
```

`polycastVersion` is read from `package.json` at runtime. The placeholder in
this example keeps the specification from copying a release number that can
drift.

## I/O contract (via polycast run)

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
