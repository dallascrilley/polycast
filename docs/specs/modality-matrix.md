# Modality matrix

**Fetched:** 2026-06-14
**Source:** polycast `CommandDef` + per-target spec docs in this directory

| Target | text | files | args | none | Skip behavior |
|--------|------|-------|------|------|---------------|
| `raycast-script` | — | — | yes | yes | `emit` returns `[]` |
| `popclip` | yes | — | — | — | `emit` returns `[]` |
| `dropzone` | partial (`Handles: Text`) | yes | — | — | `emit` returns `[]` |
| `dropover-script` | — | yes | — | — | `emit` returns `[]` |
| `shortcuts-cherri` | yes | — | — | yes | `emit` returns `[]` |
| `raycast-snippet` | hint | — | — | hint | catalog omits command |
| `raycast-quicklink` | — | — | hint | hint | catalog omits command |
| `agent-cli` | yes | yes | yes | yes | `emit` returns `[]` |

## Wrapper translation

| Modality | Body contract | Injected by emitter |
|----------|---------------|---------------------|
| `text` | read stdin | PopClip `stdin: text`; Cherri `ShortcutInput`; agent `--text` |
| `files` | `"$@"` paths | Dropzone Ruby shell-out; Dropover `"$@"` loop; agent argv |
| `args` | `$1..$n` | Raycast native; agent positional |
| `none` | stdout only | direct body |

Bodies are authored once as pure `input → stdout`; emitters inject the surface-specific adapter.
