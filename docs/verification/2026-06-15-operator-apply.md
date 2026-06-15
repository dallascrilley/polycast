# Operator verification — Dropzone + agent-cli apply

Level **B** proof for `LAUNCH_CRITERIA.md` P1-2.

## Automated (CI)

`test/operator-apply.test.ts` proves:

- `apply --write` installs agent-cli stub + commands JSON store
- Stub runs via `polycast run`; editing JSON changes behavior without re-apply
- Dropzone bundle `run.sh` dispatcher behaves the same in an isolated temp install dir
- Dropover staged `.sh` + manifest — same dispatcher + JSON edit proof ([dropover log](./2026-06-15-dropover-ui.md))

Set `POLYCAST_BIN` to a **single executable** — use [`script/polycast`](../../script/polycast) or symlink it to `~/.local/bin/polycast`.

```sh
bun test test/operator-apply.test.ts
bun test test/operator-apply.test.ts -t dropover
```

Last verified: 2026-06-15 (CI)

## Manual (live launchers)

Optional Level A UI proof on a Mac with Dropzone 5 installed.

### Prerequisites

- `POLYCAST_SKIP_CHERRI=1` if `cherri` not installed
- `POLYCAST_BIN` → `script/polycast` (or `bun link` / `~/.local/bin/polycast` symlink)

### Steps

```sh
cd /path/to/polycast
script/setup
bun run dev build --strict
bun run dev apply --target dropzone,agent-cli          # dry-run
bun run dev apply --target dropzone,agent-cli --write  # install
```

### Verify Dropzone UI

1. Drag a file onto **Basename Files**.
2. Edit `~/.polycast/commands/basename-files.json` body.
3. Re-run without re-apply — behavior updates.

### Verify agent-cli

```sh
~/.agents/tools/uppercase --text hello
```

Edit JSON store; re-run stub.

| Step | Pass? | Notes |
|------|-------|-------|
| dropzone UI drag | optional | automated test covers dispatcher path |
| agent-cli live PATH | optional | automated test covers apply + run |
