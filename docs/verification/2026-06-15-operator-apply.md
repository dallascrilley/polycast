# Operator verification — Dropzone + agent-cli apply

Level **B** proof for `LAUNCH_CRITERIA.md` P1-2.

## Prerequisites

- macOS with Dropzone 5 and polycast built locally
- `POLYCAST_SKIP_CHERRI=1` if `cherri` not installed
- Empty or polycast-owned install dirs (or use dry-run first)

## Steps

```sh
cd /path/to/polycast
script/setup
bun run dev build --strict
bun run dev apply --target dropzone,agent-cli          # dry-run — review paths
bun run dev apply --target dropzone,agent-cli --write  # install
```

## Verify Dropzone

1. Drag a file onto the **Basename Files** action (or your test command).
2. Expect basename output in Dropzone HUD / notification.
3. Edit `~/.polycast/commands/basename-files.json` body — change behavior.
4. Re-run action **without** re-apply — behavior should update (thin-shim + JSON store).

## Verify agent-cli

```sh
~/.agents/tools/uppercase --text hello   # or POLYCAST_AGENT_BIN path
```

Expect `HELLO`. Edit JSON store; re-run stub — output changes without re-apply.

## Record results

Fill transcript below and commit or attach to td-b1d630:

| Step | Pass? | Notes |
|------|-------|-------|
| dropzone dry-run | | |
| dropzone --write | | |
| dropzone run after JSON edit | | |
| agent-cli run | | |
| agent-cli after JSON edit | | |

Last verified: _pending operator run_
