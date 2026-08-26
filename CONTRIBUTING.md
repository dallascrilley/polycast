# Contributing

Thanks for looking at polycast. It is a small project, so the process is small too.

## Before you start

polycast is macOS-only by design, since every target it emits for is a macOS
launcher. You need [bun](https://bun.sh). Cherri is optional and only needed to
compile Shortcuts artifacts.

```sh
script/setup      # install dependencies
script/test       # run the test suite
script/cibuild    # exactly what CI runs
```

`script/cibuild` is the single correctness gate: lint, typecheck, test, dist
build, strict command build, runner build, version consistency, and package
smoke. If it passes locally it should pass in CI. Run it before opening a pull
request.

## Adding an emitter

An emitter is one module in `src/emitters/` registered in `src/registry.ts`. It
declares the modalities it `supports` and returns the files it wants written.

The rule that matters: if an emitter cannot faithfully represent a command's
modality, it returns `[]` so `build` skips that surface. Do not approximate. A
launcher that receives the wrong input shape is worse than a launcher that has
no artifact at all.

Emitted artifacts should be thin shims that `exec` into `polycast run` rather
than inlined copies of the command body. That is what keeps one definition
authoritative after installation.

New emitters need a case in `test/emitters.test.ts` and a short format note in
`docs/specs/`.

## Pull requests

- One logical change per PR. Conventional Commit subjects (`feat(emitters): ...`).
- Include the `script/cibuild` result in the PR description.
- Changes to a launcher's on-disk format need a matching update in
  `docs/specs/destination-mapping.md`.
- Anything touching `apply` needs to keep dry-run the default and keep the
  `.polycast-owned` marker behavior intact, since that is what makes `prune`
  safe to run against a real launcher directory.

## Verification levels

`LAUNCH_CRITERIA.md` uses three proof levels, and `docs/verification/` holds the
logs. If your change affects what an operator sees in a launcher UI, a
structural test alone is not sufficient. See `docs/verification/README.md`.

## Reporting bugs

Use the issue templates. For anything security-related, read `SECURITY.md`
instead of opening a public issue.
