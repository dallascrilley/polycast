# 0002. Toolbox-to-Polycast adapter contract

- **Status:** accepted
- **Date:** 2026-09-02
- **Linear:** WKS-1525

## Context

Polycast needs to expose trusted Toolbox workflows through launcher surfaces
without becoming a second implementation of those workflows. Toolbox already
owns its behavior, validation, policy, state, and receipts. Polycast already
owns launcher metadata, input modality adaptation, and target compatibility.

The contract must also preserve the existing boundary between `CommandDef`,
which describes deterministic commands, and `RunnerDef`, which describes
portable agent runners. A Toolbox command is not an agent runner.

## Decision

A Toolbox-backed `CommandDef` uses an `exec` body and this versioned metadata:

```ts
delegation: {
  kind: "toolbox",
  contract: "toolbox-polycast-adapter/v1",
  effectClass: "inspect" | "prepare" | "mutate" | "integrate",
  output: "canonical",
}
```

The `exec` body's `executable` is a setup-time-resolved canonical `bin/toolbox`
path. Its `args` are the non-empty fixed Toolbox command prefix. User input is
appended through the ordinary `CommandDef` modality contract: text on stdin,
files or arguments as argv, and no input for `none`. There is no shell wrapper
and no second copy of the fixed prefix in delegation metadata.

Polycast owns only these responsibilities:

1. Validate the versioned delegation shape and its required `exec` body.
2. Adapt a compatible launcher surface to the declared modality.
3. Invoke the canonical executable directly with the fixed prefix followed by
   modality input.
4. Preserve Toolbox stdout, stderr, exit status, and receipt references without
   wrapping, rewriting, persisting, or interpreting them.

Toolbox remains the sole owner of command behavior, argument validation,
authorization and policy gates, durable state, recovery, and receipts.
`effectClass` is classification metadata for surface admission; it never grants
authority. `output: "canonical"` means Polycast adds no result envelope.

Target admission is the conjunction of input modality, effect class, and output
semantics. WKS-1527 owns that compatibility predicate and rejection reasons.
Until that predicate admits a target, the presence of this contract does not
make the target eligible. Remote targets gain no new wire fields or powers:
they remain opt-in and limited by the existing forced-command protocol and its
`text`/`none` modality support. No Toolbox path, source, policy, credential, or
receipt is embedded in a remote launcher artifact.

## Consequences

- WKS-1526 can implement direct process delegation and byte-for-byte result,
  diagnostic, exit-status, and receipt-reference preservation against this
  shape.
- WKS-1527 can compute surface eligibility from `modality`, `effectClass`, and
  `output` without inspecting Toolbox internals.
- WKS-1528 can discover Toolbox-backed commands by the delegation discriminator
  and render canonical output and failures without inventing a second result
  model.
- Existing `CommandDef` emitters and every `RunnerDef` remain unchanged until a
  downstream issue explicitly consumes the contract.

## Rejected alternatives

### Copy Toolbox behavior into CommandDef bodies

Rejected because behavior, policy, state, and receipt logic would drift and
Polycast would become a second Toolbox authority.

### Store Toolbox metadata under `x.toolbox`

Rejected because `x` is reserved for target-specific launcher hints. Toolbox
delegation is a source/execution boundary shared by every compatible target.

### Duplicate the fixed command prefix in metadata

Rejected because `body.args` already owns invocation order. Two copies need a
drift validator while providing no additional authority or behavior.

### Model Toolbox workflows as RunnerDef

Rejected because these are deterministic command invocations, not agent
lifecycle definitions. `CommandDef` and `RunnerDef` remain separate.

## Verification and recovery

The canonical TypeScript type, runtime Zod parser, generated JSON Schema, and
authoring validator reject a Toolbox delegation without an `exec` body and a
non-empty fixed prefix. Reverting this decision's commit removes the additive
metadata; it does not alter Toolbox, installed launchers, remote configuration,
state, or receipts.
