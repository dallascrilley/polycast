# Build an Orca runner

Polycast accepts a `RunnerDef` module and emits an Orca plugin bundle. The
public contract is defined by the committed
[`runner-def.schema.json`](../../schemas/runner-def.schema.json).

## Define a runner

Create a file in `runners/` with a default export from `defineRunner`:

```ts
import { POLYCAST_VERSION } from "../src/constants.ts";
import { defineRunner } from "../src/runners/define.ts";

export default defineRunner({
  kind: "orca-plugin",
  id: "worktree-review",
  publisher: "polycast",
  title: "Worktree review",
  description: "Send a review prompt to the current worktree's only terminal.",
  version: POLYCAST_VERSION,
  engine: ">=1.4.188",
  commands: [
    {
      kind: "terminal-prompt",
      id: "review-worktree",
      title: "Review worktree",
      context: "worktree",
      prompt: "Review the current worktree and summarize its changes.",
      enter: "submit",
    },
  ],
});
```

`id` and `publisher` form the plugin identity. `version` is the version in the
generated manifest; the committed sample follows the package's authoritative
version. Each command is a worktree-scoped terminal prompt. `enter: "submit"`
presses Enter after insertion; `"insert"` leaves the prompt in the terminal.

## Build only

List definitions and emit bundles locally:

```sh
bun run dev runner list
bun run dev runner build --dir runners --out build
```

The build validates every definition before writing. The current output for the
sample is:

```text
build/orca-plugin/polycast.worktree-review/orca-plugin.json
build/orca-plugin/polycast.worktree-review/main.mjs
```

The `runner build` command is deliberately build-only. It writes the selected
local output directory and does not install or enable a plugin in Orca, change
Orca application state, or request/grant capabilities.

The generated manifest currently declares `workspace:read` and `terminal:send`.
Installing the local bundle in Orca and approving those capabilities remain
operator-controlled steps in the Orca UI. Polycast does not automate that
installation or consent boundary. `script/check-orca-plugin-manifest` can
optionally validate a built manifest with an already-installed Orca parser; it
does not install Orca or activate the plugin.
