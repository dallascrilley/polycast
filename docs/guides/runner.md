# Build portable runners

Polycast accepts a target-neutral `RunnerDef` module and compiles it for every
compatible runner target. The public contract is the committed
[`runner-def.schema.json`](../../schemas/runner-def.schema.json).

## Define a runner

Create a file in `runners/` with a default export from `defineRunner`:

```ts
import { POLYCAST_VERSION } from "../src/constants.ts";
import { defineRunner } from "../src/runners/define.ts";

export default defineRunner({
  kind: "runner",
  id: "worktree-review",
  publisher: "polycast",
  title: "Worktree review",
  description: "Review the current Git worktree.",
  version: POLYCAST_VERSION,
  commands: [
    {
      kind: "prompt",
      id: "review-worktree",
      title: "Review worktree",
      context: "worktree",
      prompt: "Review the current worktree and summarize its changes.",
      mode: "run",
    },
  ],
  x: { "orca-plugin": { engine: ">=1.4.188" } },
});
```

`publisher` and `id` form the qualified runner ID. Commands declare portable
prompt intent. `mode: "run"` executes the prompt. `mode: "stage"` prepares it
for operator review when a target supports staging.

Target-specific metadata stays under `x`. The Orca target requires
`x["orca-plugin"].engine`. A runner without that hint is incompatible with
Orca. Codex CLI accepts only `run` commands because its headless execution path
cannot stage text for an operator.

The loader still accepts the deprecated `kind: "orca-plugin"` contract through
the 0.2 release line. It maps terminal prompt `submit` and `insert` values to
`run` and `stage`, then warns once for each legacy source. New definitions must
use the canonical shape above. Regenerate the committed schema after changing
the canonical contract:

```sh
script/export-schema
```

## Inspect and build targets

```sh
bun run dev runner list
bun run dev runner targets
bun run dev runner build --target orca-plugin,codex-cli --out build
```

`runner list` reports compatibility for every registered target. An implicit
build emits compatible targets and reports incompatible targets as skipped. An
explicit unknown, duplicate, empty, or incompatible target selection fails
before Polycast creates the output directory or writes a file.

The committed runner emits these files:

```text
build/orca-plugin/polycast.worktree-review/orca-plugin.json
build/orca-plugin/polycast.worktree-review/main.mjs
build/codex-cli/polycast.worktree-review/review-worktree
build/codex-cli/polycast.worktree-review/review-worktree.prompt.txt
build/codex-cli/polycast.worktree-review/runner.json
```

The Orca output preserves the plugin manifest and worker behavior. Orca maps
`run` to terminal submission and `stage` to insertion without Enter.

The Codex executable accepts zero or one worktree path. It resolves the Git
root, reads its sibling prompt file, and invokes:

```sh
codex exec --cd <git-root> -
```

The prompt is sent on stdin. The wrapper does not add approval, sandbox, model,
profile, or configuration flags, so it uses the operator's normal Codex
configuration.

## Build-only boundary

Runner builds write only to the selected local output directory. They do not
install or enable an Orca plugin, change Orca or Codex configuration, launch an
agent, or request capabilities. Installing the Orca bundle and approving its
`workspace:read` and `terminal:send` capabilities remain operator actions in
Orca. Polycast does not install the Codex wrappers.

`script/check-orca-plugin-manifest` can validate a built manifest with an
already-installed Orca parser. It does not install Orca or activate the plugin.
