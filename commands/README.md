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
