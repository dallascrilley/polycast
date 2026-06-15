# Your first command

Walkthrough for authoring one `CommandDef`, building artifacts, and installing
to a launcher. Assumes you have run `script/setup` (or `just setup`).

## Sample pack

Three built-in commands cover every modality polycast ships today:

| Command | Modality | Surfaces | File |
|---------|----------|----------|------|
| **Uppercase** | `text` | PopClip, Shortcuts, agent-cli | [`commands/uppercase.ts`](../../commands/uppercase.ts) |
| **Open Code Repo** | `args` | Raycast script, Shortcuts, agent-cli | [`commands/open-repo.ts`](../../commands/open-repo.ts) |
| **Basename Files** | `files` | Dropzone, Dropover, agent-cli | [`commands/basename-files.ts`](../../commands/basename-files.ts) |

List what your checkout supports:

```sh
bun run dev list
```

Each row shows modality and compatible emitters. If a surface is missing, the
modality or hints do not match — see [`docs/specs/destination-mapping.md`](../specs/destination-mapping.md).

## 1. Choose modality

| Modality | Body reads | Example surface |
|----------|------------|-----------------|
| `text` | stdin | PopClip selection |
| `files` | `"$@"` paths | Dropzone drag |
| `args` | `$1`, `$2`, … | Raycast argument fields |
| `none` | (no input) | trigger-only actions |

The body is always **input → stdout**. Emitters wrap your script so each launcher
feeds the right input shape.

## 2. Author the definition

Create `commands/my-command.ts`:

```ts
import { defineCommand } from "../src/define.ts";

export default defineCommand({
  id: "my-command",           // kebab-case; becomes filenames / bundle ids
  title: "My Command",
  description: "One line for launchers.",
  modality: "text",           // text | files | args | none
  author: "you",
  body: {
    lang: "bash",
    source: "tr '[:lower:]' '[:upper:]'",  // or multiline bash
  },
});
```

For **args** modality, add `args: [{ name: "folder", placeholder: "repo" }]`.

For Raycast-only hints (silent mode, package name):

```ts
  x: { raycast: { mode: "silent", packageName: "Navigation" } },
```

`defineCommand` validates at import time. Full shape:
[`schemas/command-def.schema.json`](../../schemas/command-def.schema.json).

## 3. Build (preview artifacts)

```sh
bun run dev build                      # all targets → ./build/<target>/
bun run dev build --target popclip     # one emitter
bun run dev build --strict             # fail if any command skips a target
```

Inspect `./build/` — each emitter writes its native format (`.popclipext`,
`.sh`, `.dzbundle`, etc.). Shortcuts emit `.cherri`; compiled `.shortcut` appears
when `cherri` is on PATH (CI sets `POLYCAST_SKIP_CHERRI=1`).

## 4. Run without installing

Thin-shim targets delegate to the polycast CLI:

```sh
echo hello | bun run dev run uppercase --text hello
bun run dev run open-repo -- polycast
bun run dev run basename-files -- /tmp/foo/bar.txt
```

Use this to debug the body before touching launcher install dirs.

## 5. Apply (install)

Dry-run first (default):

```sh
bun run dev apply --target popclip,agent-cli
```

Write to install paths:

```sh
bun run dev apply --write --target popclip,agent-cli
```

Override destinations with env vars (see mapping doc):

| Variable | Default role |
|----------|--------------|
| `POLYCAST_POPCLIP_EXTENSIONS` | PopClip extensions folder |
| `POLYCAST_RAYCAST_DIR` | Raycast script commands dir |
| `POLYCAST_DROPZONE_ACTIONS` | Dropzone actions folder |
| `POLYCAST_AGENT_BIN` | Agent CLI binaries (`~/.agents/tools/`) |

Installed artifacts get a `.polycast-owned` marker. Re-apply updates in place;
`polycast prune` removes only polycast-owned files.

**Isolated test** (no dotfiles mutation):

```sh
export POLYCAST_AGENT_BIN=/tmp/polycast-test/bin
mkdir -p "$POLYCAST_AGENT_BIN"
bun run dev apply --write --target agent-cli
/tmp/polycast-test/bin/uppercase --text hello
```

See [`docs/verification/2026-06-14-core-path.md`](../verification/2026-06-14-core-path.md)
for PopClip + Raycast script-level proof.

## 6. Agents (MCP)

Cursor loads `.cursor/mcp.json` in this repo. Tools mirror CLI:

- `polycast_list` — catalog
- `polycast_build` / `polycast_apply` — dry-run by default; `write: true` to install
- `polycast_command_upsert` — add or update a command JSON (validated against schema)

See [`docs/agent-native/capability-map.md`](../agent-native/capability-map.md).

## polycast vs forge

| Tool | Scope |
|------|--------|
| **polycast** | One `CommandDef` → many launcher artifacts; `apply` syncs all targets |
| **forge** | Single-tool lifecycle (`forge new`, `wrap`, `install --target raycast`, `promote`) |

Agent-cli output from polycast is forge-wrap compatible. Use polycast when the
same verb should appear in PopClip, Raycast, Dropzone, and `~/.agents/tools/`.
Use forge when you are promoting one wrapped script through a single surface.

## Next steps

- Platform details: [`docs/specs/README.md`](../specs/README.md)
- Architecture: [`docs/DESIGN.md`](../DESIGN.md)
- Operator apply proof: [`docs/verification/2026-06-15-operator-apply.md`](../verification/2026-06-15-operator-apply.md)
