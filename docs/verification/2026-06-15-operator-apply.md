# Operator verification — Dropzone + agent-cli apply

Level **B** proof for `LAUNCH_CRITERIA.md` P1-2.

## Automated (CI)

`test/operator-apply.test.ts` proves:

- `apply --write` installs agent-cli stub + commands JSON store
- Stub runs via `polycast run`; editing JSON changes behavior without re-apply
- Dropzone bundle `run.sh` dispatcher behaves the same in an isolated temp install dir

Set `POLYCAST_BIN` to a **single executable** (wrapper script if using `bun run src/cli.ts`).

```sh
bun test test/operator-apply.test.ts
```

Last verified: 2026-06-15 (CI)

## Manual (live launchers)

Optional Level A UI proof on a Mac with Dropzone 5 installed.

### Prerequisites

- `POLYCAST_SKIP_CHERRI=1` if `cherri` not installed
- `POLYCAST_BIN` on PATH or wrapper script exporting `polycast`/`bun run …`

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
