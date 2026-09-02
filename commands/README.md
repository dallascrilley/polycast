# Sample command pack

Default-export each file as a `CommandDef` via `defineCommand`.

| File | ID | Modality | Primary surfaces |
|------|-----|----------|------------------|
| [`uppercase.ts`](uppercase.ts) | `uppercase` | text | PopClip |
| [`copy-to-clipboard.ts`](copy-to-clipboard.ts) | `copy-to-clipboard` | text | PopClip, Shortcuts, agent-cli |
| [`save-url-to-vault.ts`](save-url-to-vault.ts) | `save-url-to-vault` | text | Shortcuts share sheet, agent-cli |
| [`open-repo.ts`](open-repo.ts) | `open-repo` | args | Raycast script |
| [`basename-files.ts`](basename-files.ts) | `basename-files` | files | Dropzone, Dropover, Shortcuts, agent-cli |
| [`file-to-inbox.ts`](file-to-inbox.ts) | `file-to-inbox` | files | Dropzone, Dropover, Shortcuts, agent-cli |

Authoring walkthrough: [`docs/guides/first-command.md`](../docs/guides/first-command.md).

## Canonical Toolbox bindings

A Toolbox command stays authoritative for behavior, validation, policy, state,
output, failures, and receipts. Bind it as a direct executable rather than
copying its implementation into a shell body:

```ts
import { defineToolboxCommand, resolveToolboxExecutable } from "../src/toolbox-adapter.ts";

const toolbox = resolveToolboxExecutable();

export default defineToolboxCommand({
  id: "toolbox-knowledge-search",
  title: "Search Toolbox knowledge",
  description: "Search the canonical Toolbox knowledge store.",
  executable: toolbox,
  fixedArgv: ["knowledge", "search"],
  modality: "args",
  args: [{ name: "query", placeholder: "Search terms" }],
  effectClass: "inspect",
  output: "canonical",
});
```

`resolveToolboxExecutable()` performs setup-time path resolution and accepts
`POLYCAST_TOOLBOX_BIN` as an override. `defineToolboxCommand()` emits a
shell-free `exec` body and emits the top-level `delegation` metadata required by
the contract. The fixed prefix is stored only in `body.args`; Polycast passes
the canonical process's stdout, stderr, exit status, and any receipt reference
through `polycast run`; it does not create an envelope or receipt of its own.
