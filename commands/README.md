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
| [`agents.ts`](agents.ts) | `agents` | none | Shortcuts (native), agent-cli |
| [`reviews.ts`](reviews.ts) | `reviews` | none | Shortcuts (native), agent-cli |
| [`agent-console.ts`](agent-console.ts) | `agent-console` | none | Shortcuts (native, Blink Shell) |
| [`send-to-device.ts`](send-to-device.ts) | `send-to-device` | files | Shortcuts (native, Taildrop), Dropzone, Dropover, agent-cli |

Agents, Reviews, Agent Console, and Send to Device are the WKS-1420 iPhone
device-fabric Shortcuts; see
[`docs/specs/device-fabric.md`](../docs/specs/device-fabric.md).

Authoring walkthrough: [`docs/guides/first-command.md`](../docs/guides/first-command.md).
