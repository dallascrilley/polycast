# Security policy

## Reporting a vulnerability

Report privately through GitHub's
[security advisory form](https://github.com/dallascrilley/polycast/security/advisories/new)
rather than a public issue. I will acknowledge within a week.

## Scope and threat model

polycast is a local code generator. It has no server, no network calls, and no
credential handling. Two properties are worth stating explicitly, because both
involve writing to and executing from your machine.

**Generated artifacts execute arbitrary shell.** A `CommandDef` body is a shell
script, and polycast emits it into launcher directories where the launcher will
run it. A malicious or careless command definition is therefore equivalent to
running a script yourself. Treat `commands/*.ts` from any source you would not
run directly as untrusted, and read a definition before you `apply --write` it.
This is inherent to what the tool does, not a defect.

**`apply` writes into real launcher directories.** It is dry-run by default and
requires `--write` to mutate anything. Every file polycast creates is paired
with a `.polycast-owned` marker, and `prune` deletes only files carrying that
marker, so it will not remove artifacts you wrote by hand. Reports that `apply`
or `prune` can be made to write or delete outside its declared destinations, or
to remove files it does not own, are in scope and I want to hear about them.

Also in scope: path traversal or injection through a command `id`, `title`, or
argument that escapes the emitted artifact's structure, and any case where an
emitter produces a shim that runs something other than the intended body.

Out of scope: the behavior of the launchers themselves (Raycast, PopClip,
Dropzone, Dropover, Shortcuts), the Cherri compiler, and consequences of running
a command definition you chose to install.

## Supported versions

polycast is pre-1.0. Fixes land on `main` only.
