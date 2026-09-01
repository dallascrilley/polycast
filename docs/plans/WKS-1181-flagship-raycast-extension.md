# WKS-1181: Flagship Raycast extension with command UI and worktree picker

Execution cost: one PR in one repository (polycast), no serial dependency on
other PRs. Committed verification is `script/cibuild` (lint, typecheck, tests,
builds, package-smoke) plus new bun tests for the extension's pure helpers and
a one-time `tsc --noEmit` inside the extension package. One live-only check
remains at the end: rendering and running the extension inside Raycast itself,
which no committed check can exercise; Dallas reviews that personally after
merge. Re-verification on head advance is one `script/cibuild` run.

## Outcome

A hand-written Raycast extension living at `raycast-extension/` in the
polycast repo. It lists commands from the `~/.polycast/commands` store,
renders a form per command's args (dropdowns, password fields, and a live
Orca worktree picker), and dispatches through `polycast run`. The motivating
gap: launcher contexts have no cwd, so cwd-based worktree resolution fails;
the picker replaces the free-text selector field. This is a runtime-dynamic
extension reading the store, not a codegen emitter target.

## State already done (do not redo)

- Linear: WKS-1181 is In Progress and assigned, moved out of Triage on the
  operator's explicit accept in chat ("let's go with the flagship extension").
  Mutate Linear only via `orca linear ...` (agent identity), never the
  operator's MCP token. The `linear-delivery` skill governs the loop; load it.
- Worktree: `/Users/dallascrilley/Code/.worktrees/polycast/WKS-1181-raycast-extension`,
  branch `dallascrilley/WKS-1181-raycast-extension`, Orca-managed, linked to
  WKS-1181, based on current main. `bun install --frozen-lockfile` already ran.
- Commit `9d8589f` (on the branch): IR change adding `picker?: "orca-worktree"`
  to `CommandArg` in `src/types.ts`, validation in `src/define.ts`
  (`assertValid` rejects a picker on non-text args), zod field in
  `src/schema/command-def.ts`, regenerated `schemas/command-def.schema.json`
  via `bun run script/export-schema`, and a test in `test/schema.test.ts`.
  Typecheck and schema tests pass.
- Written but uncommitted (commit alongside this plan or with the extension):
  `raycast-extension/package.json` (Raycast manifest with four preferences:
  polycastBin, commandsDir, orcaBin, extraPath), `raycast-extension/tsconfig.json`
  (standard Raycast template settings), `raycast-extension/.gitignore`
  (`dist/`, `.DS_Store`).

## Facts discovered this session (trust these, verified against the repo)

- `polycast run <id> [--commands <dir>] [--] args...`: for modality `args`,
  values are positional argv in declared arg order (`--` is filtered out in
  `src/run.ts` `executeCommand`); for modality `text`, pass `--text <value>`
  instead of wiring stdin. `none` takes no input. Skip `files` in v1.
- Commands store documents (`~/.polycast/commands/*.json`) are serialized
  CommandDefs: `id`, `title`, `description`, `icon` (emoji string), `modality`,
  `args[]` with `name`, `placeholder`, `optional`, `type`
  (`text|password|dropdown`), `data[{title,value}]`, and now `picker`.
- `orca worktree list --json` returns `.result.worktrees[]` with
  `displayName`, `path`, `branch` (may carry a `refs/heads/` prefix, strip it
  for display), `isArchived`, `lastActivityAt` (epoch ms). About 125 rows on
  this machine. There is NO focused/frontmost-workspace field or CLI surface
  anywhere in orca (checked `terminal list`, `worktree list/show`, `status`,
  `agent-context`), which is exactly why the picker exists. Selector value
  format for a picked worktree: `path:<absolute-path>`.
- Root `tsconfig.json` includes only `src`, `commands`, `runners`, `test`, so
  `raycast-extension/` stays out of root typecheck automatically. Root tests
  may import the extension's pure lib files with explicit `.ts` extensions
  (root uses `moduleResolution: bundler` + `allowImportingTsExtensions`).
- CI is exactly `script/cibuild`: `bun install --frozen-lockfile`, `bun run
  lint` (biome), `bun run typecheck` (tsc), `bun test`, `bun run build`,
  `POLYCAST_SKIP_CHERRI=1 bun run dev build --strict`, `bun run dev runner
  build`, `bun run check:version`, `bun run package-smoke`.
- `package.json` has no `files` field and there is no `.npmignore`, so
  `raycast-extension/` will enter the npm tarball. Run `bun run package-smoke`
  early; if it fails or the tarball bloat is unacceptable, prefer adding
  `raycast-extension` to the pack exclusion the way the repo already handles
  it (inspect `script/package-smoke` first), and say so in the PR.
- Raycast API: pin `@raycast/api` `^1.104.25` (latest 1.x). 2.x exists
  (2.1.2) but was deliberately not chosen: unknown breaking surface, and 1.x
  extensions load fine for a personal extension. Do not silently upgrade.
  React is provided by Raycast; only `@types/react` is needed for
  `jsx: react-jsx` typechecking.
- Repo merge convention is squash with `(#NN)` titles. Biome formats with the
  repo `biome.json`; run `bunx biome check --write` on new files.

## Remaining work, in order

Each step ends with its named check green before the next starts.

### 1. Extension pure helpers (testable without Raycast)

`raycast-extension/src/lib/store.ts`, no `@raycast/api` imports:

- `StoredCommand` / `StoredArg` interfaces mirroring the store JSON above.
- `parseStoredCommand(raw: string): StoredCommand | null`: JSON.parse in
  try/catch, then field-by-field narrowing (typeof checks building a new
  object). The user's global rules ban `as unknown as`; a single
  `as Record<string, unknown>` after a typeof-object check is acceptable,
  blind double casts are not. Unknown modality or missing id/title returns
  null (a malformed store file must not crash the list).
- `buildArgv(args, values: Record<string, string>): string[]`: map declared
  args in order to `values[name] ?? ""`, preserving positions so `$2` stays
  `$2` when `$1` is empty.

`raycast-extension/src/lib/orca.ts`, also pure:

- `parseWorktreeOptions(raw: string): WorktreeOption[]` where WorktreeOption
  is `{ value, title, subtitle?, keywords }`. Parse the orca JSON, require
  `ok === true`, filter `isArchived`, sort by `lastActivityAt` desc (missing
  sorts last), map to `value: "path:" + path`, `title: displayName ?? path`,
  `subtitle`: branch without `refs/heads/`, keywords from branch and path
  segments so Raycast search matches them.

Check: `test/raycast-extension-lib.test.ts` at repo root (bun test), covering
malformed JSON, a real-shaped store document (copy the rename-orca-tabs JSON
shape), argv ordering with a missing middle value, archived filtering, sort
order, and the `refs/heads/` strip. Run `bun test` and root `bun run
typecheck` (the test import pulls the lib files into root tsc; they must pass
strict + noUncheckedIndexedAccess).

### 2. Extension UI

`raycast-extension/src/run-command.tsx`, one command, three views:

- CommandList: on mount read `commandsDir` (expand `~/`), parse every `*.json`
  with `parseStoredCommand`, drop nulls and modality `files`. `List.Item` per
  command: icon (emoji string works), title, description as subtitle,
  modality as accessory. Action pushes CommandForm; for modality `none`, push
  RunView directly.
- CommandForm: field per arg. `dropdown` with `data` becomes `Form.Dropdown`
  (prepend an empty item when `optional`); `password` becomes
  `Form.PasswordField`; `picker: "orca-worktree"` becomes the worktree picker:
  execFile the `orcaBin` preference with `["worktree", "list", "--json"]`,
  feed `parseWorktreeOptions`, render `Form.Dropdown` with an initial
  `(resolve from current directory)` empty item, most recent worktree next.
  If orca fails, fall back to a plain `Form.TextField` (decide once after the
  load attempt resolves) and show a failure toast; never leave the user with
  an empty dropdown they cannot type into. Everything else is
  `Form.TextField` with the arg placeholder. Modality `text` renders one
  `Form.TextArea` for stdin-equivalent input. Submit builds argv via
  `buildArgv` and pushes RunView.
- RunView: spawn (node:child_process) `polycastBin` with
  `["run", "--commands", commandsDir, id, "--", ...argv]`, appending
  `["--text", value]` instead for text modality. Environment: PATH = existing
  PATH + expanded `extraPath` preference entries (this is what makes `orca`,
  `jq`, `bun`, `pi` resolvable from Raycast's minimal PATH; the earlier
  Raycast failure this session was exactly a PATH gap). Stream stdout+stderr
  into state, render in a Detail markdown code fence (cap at the last ~200
  lines), `isLoading` until exit, success/failure toast with the exit code.
  Keep the child handle and kill it in the useEffect cleanup; kill only that
  PID, never by name (user rule).

Assets: `raycast-extension/assets/icon.png`, 512x512. Generate a flat-color
placeholder programmatically (python zlib/struct or any available tool); note
in the PR that it is a placeholder.

Check: `cd raycast-extension && npm i && npx tsc --noEmit` passes (this is
the extension's only committed type proof; `ray` CLI is not installed on this
machine, so `ray build` is not available). `bunx biome check raycast-extension`
clean from the repo root.

### 3. Docs and store wiring

- Root `README.md`: short "Raycast extension (flagship)" section: what it is,
  `npm i && npm run dev` inside `raycast-extension/` to develop, import as a
  local extension, the four preferences, and that script-command emission
  remains for store distribution.
- `CHANGELOG.md`: entry under the unreleased/current heading matching the
  existing style (read a recent entry first).
- `~/Scripts/Prompts` (separate repo, separate commit there, NOT in this PR):
  set `picker: "orca-worktree"` on `worktreeArg` in `lib/harness-arg.ts`,
  rebuild, `apply --write`, so the store documents carry the hint. This is a
  follow-up after the polycast PR merges, since the built store JSON schema
  gains `picker` from commit `9d8589f`.

### 4. Full local proof

`./script/cibuild` from the worktree root, green end to end. If
`package-smoke` objects to the new directory, handle per the Facts section.
Also run a real dispatch smoke: with the store already installed on this
machine, `~/.local/bin/polycast run rename-orca-tabs --commands
~/.polycast/commands -- print path:/Users/dallascrilley/Workspace/operations/polycast`
exits 0 (proves the exact spawn contract RunView uses).

### 5. Deliver (linear-delivery obligations)

- Commits: keep `9d8589f` as is; commit scaffold+plan if not already done;
  then one commit for helpers+tests, one for the UI+docs. Stage only owned
  paths, never `git add -A`.
- Push the branch, open the PR with `gh pr create` (base main). Body: what,
  why (launcher cwd gap, no orca focus API), verification actually run, the
  1.x-not-2.x decision, the placeholder icon, and the live-only Raycast check
  named for Dallas. End the body with the standard Claude Code attribution
  lines used in this repo's recent PRs.
- Attach the PR to WKS-1181 (`orca linear attach WKS-1181 --url <pr> --title
  "PR link" --json`), post the PR-open receipt comment (issue, PR, exact head
  SHA, risk tier and reason, review/CI entered), move status to the unique
  review-oriented started state (Workspace uses `Review`), and run the
  repo's PR review loop (CI here is Cursor approval agent + Bugbot + ci; all
  three were required and green on PR #49 earlier today).
- Merge on green via squash (repo convention), delete the branch, let Orca own
  the worktree's removal (Orca alone removes Orca-managed worktrees; do not
  `git worktree remove` it yourself, archive it through Orca or leave it for
  reconciliation).
- Post the post-merge receipt (exact-head proof, merge SHA, residual risk:
  live Raycast rendering unverified, icon placeholder, percentEncoded args
  passed raw). Do NOT move the issue to Done; completion is computed by the
  Symphony/Harness validator, not declared (ADR-0010). Then invoke
  `next-linear-handoff` exactly once.

## Out of scope (do not expand)

- `files` modality support, a command generator/emitter for extensions,
  Raycast store publication, @raycast/api 2.x migration, orca-side
  focused-workspace API (if wanted, file one triage issue on the owning team
  instead), and any `~/Scripts/Prompts` change beyond the one-line picker
  hint follow-up named above.

## Global rules that bit or nearly bit this session

- `git reset --hard` is deny-listed in this harness; re-point branches with
  `git switch --detach` + `git branch -f` on a clean tree instead.
- No direct pushes to main; no force-push; squash via PR only.
- No `console.log` in shipped source (RunView streams into state, not logs).
- No em dashes in authored Markdown.
- Shell cwd resets between Bash calls in this harness; use absolute paths or
  re-`cd` in each command.
