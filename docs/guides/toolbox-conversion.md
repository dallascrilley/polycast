# Convert a Toolbox tool to multiple Polycast surfaces

Maintainer reference for exposing one useful Toolbox command through more than
one Polycast launcher without making Polycast a second Toolbox authority. The
canonical example is the Knowledge fixture in
[`test/fixtures/toolbox-knowledge-command.ts`](../../test/fixtures/toolbox-knowledge-command.ts),
and its exercised journey is
[`test/toolbox-knowledge-journey.test.ts`](../../test/toolbox-knowledge-journey.test.ts).

## Ownership boundary

| Owner | Owns |
|---|---|
| Toolbox | Behavior, argument validation, authorization, policy, state, recovery, output, failures, and receipts. |
| Polycast | `CommandDef` metadata, the versioned delegation shape, modality adaptation, target compatibility, and thin launcher shims. |
| Launcher surface | Only its native input collection and presentation. |

Polycast must invoke the canonical `bin/toolbox` executable directly. It must
not copy Toolbox behavior into a script body, invent a result envelope, or
create or interpret a receipt.

## 1. Qualify the tool

Publish a conversion only when all of these are true:

- The tool has one stable `CommandDef` modality: `text`, `files`, `args`, or
  `none`.
- The canonical executable resolves to an executable regular
  `<toolbox-root>/bin/toolbox` file. `resolveToolboxExecutable()` performs this
  setup-time check and accepts `POLYCAST_TOOLBOX_BIN` as its override.
- At least two intended targets preserve the modality, effect gate, and
  canonical output/failure semantics. A target allowlist records that intended
  set; it does not make an incompatible target compatible.
- The Toolbox result bytes, stderr, exit status, and any receipt reference are
  useful without Polycast rewriting them.

Disqualify the conversion when it has only one compatible surface, needs a
lossy presentation, embeds a shell wrapper or copied Toolbox logic, points at
an unverified executable, or relies on Polycast to authorize an effect. Do not
add a second surface by guessing at an input or output mapping.

## 2. Declare the top-level adapter

Use `defineToolboxCommand()`. It emits the top-level `delegation` discriminator
and keeps the executable and fixed prefix in the `exec` body:

```ts
import { defineToolboxCommand, resolveToolboxExecutable } from "../src/toolbox-adapter.ts";

const toolbox = resolveToolboxExecutable();

export default defineToolboxCommand({
  id: "toolbox-knowledge-search",
  title: "Search Toolbox Knowledge",
  description: "Search the canonical Toolbox knowledge store.",
  executable: toolbox,
  fixedArgv: ["knowledge", "--json", "search"],
  modality: "args",
  args: [{ name: "query", placeholder: "Search terms" }],
  effectClass: "inspect",
  output: "canonical",
  targets: ["raycast-script", "agent-cli"],
});
```

The helper produces this top-level metadata; do not put it under `x` or repeat
the fixed prefix in a second field:

```ts
delegation: {
  kind: "toolbox",
  contract: "toolbox-polycast-adapter/v1",
  effectClass: "inspect",
  output: "canonical",
}
```

`effectClass` is classification, not authorization. For `mutate` and `integrate`,
each selected target must preserve its declared gate: Raycast requires
`x.raycast.needsConfirmation: true`, `agent-cli` is a direct local surface, and
catalog-only and existing remote targets deny them. Toolbox remains the
authority for the final policy decision.

The committed Knowledge fixture takes the resolved executable as a function
argument because the canonical path is setup-time machine state. Keep that
fixture out of the sample command pack; use it as the reference binding and
journey input.

## 3. Inspect and build only compatible targets

The CLI help defines `--dir`, `--out`, `--target`, and `--strict` for this path:

```sh
bun run dev targets
bun run dev list --dir <one-command-dir>
bun run dev build \
  --dir <one-command-dir> \
  --out build/toolbox-knowledge \
  --target raycast-script,agent-cli \
  --strict
```

For the example above, `list` should report:

```text
toolbox-knowledge-search  [args]  -> raycast-script, agent-cli
```

The target registry checks modality first, then Toolbox output and effect
compatibility. An incompatible emitter returns no artifact and a reason; it is
not repaired by a fallback wrapper. The explicit allowlist also prevents an
unintended surface from being published.

The two selected targets produce a body store plus one artifact per surface:

```text
build/toolbox-knowledge/
├── commands/toolbox-knowledge-search.json
├── raycast-script/toolbox-knowledge-search.sh
└── agent-cli/
    ├── toolbox-knowledge-search
    ├── toolbox-knowledge-search.polycast-meta.json
    └── toolbox-knowledge-search.polycast-owned
```

`raycast-script` supports `args` and defaults to `fullOutput`; `agent-cli`
supports every declared modality. Both are dispatcher shims over the same JSON
body store. `polycast run` appends the modality input after the fixed
`body.args` prefix and executes Toolbox directly.

Do not treat a successful build as authorization or installation. `apply` is a
separate operation, is dry-run by default, and only `--write` installs artifacts.

## 4. Preserve canonical results and receipts

The `exec` body is the only invocation source:

```text
body.args = ["knowledge", "--json", "search"]
final argv = body.args + ["<query>"]
```

Polycast passes through Toolbox stdout, stderr, and exit status. With
`output: "canonical"`, it adds no result envelope and does not append a
newline to canonical output. If Toolbox emits a receipt reference, it remains
in the original output; Polycast does not persist or reinterpret it. The
direct process and byte-preservation behavior is covered by
[`test/toolbox-adapter.test.ts`](../../test/toolbox-adapter.test.ts).

The Raycast extension may format captured output for display, but the journey
proof compares the raw Raycast and agent-cli streams before presentation.

## 5. Prove the two-surface journey

Run the canonical fixture with the real resolved Toolbox executable:

```sh
bun test test/toolbox-knowledge-journey.test.ts
```

The test uses the stored `CommandDef` through the Raycast command-console
dispatch path and runs the generated `agent-cli` artifact. It proves both
surfaces against the same command and store:

| Input | Required result on both surfaces |
|---|---|
| `wks-1529-polycast-surface-proof-unique` | Exit `0`, stderr empty, stdout exactly `[]\n`. |
| `--wks-1529-invalid-option` | Exit `2`, stdout empty, and stderr contains `knowledge: error: unrecognized arguments: --wks-1529-invalid-option`. |

The test is skipped when `resolveToolboxExecutable()` cannot find the canonical
binary. A skip is an environment result, not two-surface proof; install or
expose the canonical Toolbox executable and rerun before publishing evidence.

## Disqualifying examples

- `body: { lang: "bash", source: "toolbox knowledge search" }`: Polycast now
  owns a shell interpretation and no longer preserves the direct executable
  boundary.
- `delegation` nested under `x.toolbox`, or a duplicated command prefix in
  metadata: the versioned top-level contract and one invocation source are lost.
- `targets: ["raycast-script"]`, or a command whose second candidate fails the
  modality/output/effect predicate: it is single-surface, not a multi-surface
  conversion.
- A `mutate` or `integrate` command without Raycast confirmation, or any
  sensitive effect sent through an existing remote/catalog target: the required
  surface gate is absent.
- A snippet or quicklink conversion that replaces canonical command output with
  static text or a URL: those catalog surfaces do not preserve Toolbox output.
- A remote conversion that adds Toolbox paths, credentials, source, policy, or
  receipts to the wire artifact: remote targets retain their existing fixed
  protocol and modality boundaries.

## Maintainer closeout

Keep the Toolbox implementation and its receipts authoritative. When changing
the binding, update the fixture and journey expectations together, then run the
focused journey and the repository gate:

```sh
bun test test/toolbox-adapter.test.ts test/toolbox-knowledge-journey.test.ts
script/cibuild
```

The adapter contract itself is recorded in
[`docs/decisions/0002-toolbox-adapter-contract.md`](../decisions/0002-toolbox-adapter-contract.md).
