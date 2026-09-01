# Capture Raycast snippets

Polycast can capture static Raycast snippets as reviewed, source-controlled
`CommandDef` modules. The capture command reads a JSON export and leaves that
file unchanged. It defaults to a dry run because a Raycast library can contain
passwords, API keys, personal data, and text that only works inside Raycast.

Raycast documents snippet JSON as an array of objects with required `name` and
`text` fields plus an optional `keyword`. Current Raycast exports may also carry
`tags`. Polycast validates each row independently, reports tags as omitted
metadata, and never copies the source export into the repository.

## Preview the latest export

Run:

```sh
bun run dev capture --from raycast-snippets
```

Latest-export discovery checks only these directories:

- `$POLYCAST_RAYCAST_SNIPPET_EXPORT_DIR`, when set
- `~/.dotfiles/raycast/snippets/`
- `~/Downloads/`, limited to JSON filenames containing `snippet`

The command selects the newest matching regular file by modification time. It
does not follow symlinks or recursively search your home directory. Select a
different file explicitly when needed:

```sh
bun run dev capture --from raycast-snippets --input "/path/to/Snippets export.json"
```

The preview prints the input path and SHA-256 digest, accepted and rejected
counts, counts by rejection and loss reason, and the planned file changes. It
does not print snippet names or text.

## Review the safety result

Polycast rejects a row when it finds any of these conditions:

- an invalid object, blank required field, control character, or text over 8 KiB
- a known token, private key, authorization header, credential assignment,
  credential-bearing URL, or high-entropy token
- personal email, phone, Social Security, passport, or payment-card data
- a Raycast dynamic placeholder such as `{clipboard}`, `{date}`, or `{argument}`
- a user-specific absolute path, private IP address, localhost URL, or internal host
- a physical street address, Tailscale host, raw IP address, or SSH key path
- a destructive shell shortcut or an agent permission-bypass flag
- a duplicate keyword or deterministic command ID

The filters favor false rejections over committing private text to Polycast's
public repository. They are a review aid, not proof that arbitrary text is safe.
Run a repository secret scanner on the preview or resulting diff before pushing.

Polycast trims surrounding whitespace from a snippet name so it can become a
valid command title. It records that normalization as `name-trimmed`. Raycast
tags and unknown fields do not affect whether static text is portable, so
Polycast omits them and records `tags-omitted` or `unknown-fields-omitted`.
Each report row carries the zero-based index from the preserved export.

## Write reviewed definitions

After reviewing the preview, run:

```sh
bun run dev capture --from raycast-snippets --write
```

Polycast writes generated modules to `commands/raycast-snippets/` and writes a
deterministic `capture-report.json` beside them. Each module passes the normal
`CommandDef` validation. Each generated definition carries a
`targets: ["raycast-snippet"]` allowlist, so it does not create unrelated script,
PopClip, Shortcut, or agent artifacts. The command body prints the static text,
while the Raycast hint rebuilds `build/raycast-snippet/snippets.json`.

Capture owns only files with its generated header and its marked report. It
refuses to write if the output directory contains any other file or directory.
On rerun it updates changed definitions and removes stale generated definitions.
An unchanged export produces no file diff.

To use another source-controlled destination, pass `--dir <path>`. Build loads
nested command directories, so definitions under the default directory join the
rest of `commands/` automatically.

## Verify the result

Run:

```sh
bun run dev capture --from raycast-snippets
bun run dev build --strict --target raycast-snippet
bun test test/raycast-snippet-capture.test.ts test/emitters.test.ts
```

The first command should report every definition and the report as unchanged.
The strict build should emit `build/raycast-snippet/snippets.json`. Review the
Git diff and run a secret scanner before publishing the branch.
