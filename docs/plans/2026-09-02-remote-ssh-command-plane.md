# Remote SSH command plane

Living implementation plan for Polycast's first constrained remote surfaces.

## Purpose

Polycast command definitions can explicitly opt into remote execution without
placing a host, credential, or command body in a generated launcher. iPhone
and iPad Shortcuts use Cherri's SSH action with a device-owned key; Termux uses the existing `mac-exec`
route. The Mac accepts only a fixed protocol command and executes its canonical
stored body.

## Foundation

`CommandDef` is the single public command IR. `polycast run` loads a canonical
JSON definition from the host command store before executing its body. New
remote targets therefore remain thin transports: they carry an ID, protocol
version, and stdin text only. `x.remote.profile` is the explicit per-command
opt-in; an optional target allowlist may narrow that opt-in further.

Private connection state belongs in a local profile file. Its host and user are
read while building the iPhone/iPad artifact and never enter `CommandDef`, the
public schema examples, or Git. The Shortcut's key is generated and stored on
the device. The resulting build output is already ignored, so its private
connection metadata must be handled carefully.

The host-side boundary is `polycast remote --forced`. An SSH forced command
invokes it without arguments; it parses only the exact `SSH_ORIGINAL_COMMAND`
grammar emitted by Polycast. It has one writer/owner: the installed Polycast
command store. No arbitrary shell text is parsed or executed.

## Decisions

- Initial remote modalities are `none` and `text`. `args` requires a separately
  versioned JSON envelope; files require explicit transfer and path semantics.
- SSH-key transport is the only generated Cherri profile mode. Password
  transport is intentionally excluded from the first profile schema.
- Termux output calls `mac-exec`; it neither emits nor installs SSH settings.
- Jump Desktop Connect is deferred. This session observed a root-owned
  LaunchDaemon (`system/com.p5sys.jump.connect.service`), so a restart requires
  an exact-purpose privileged helper before it can become a remote command.

## Acceptance

- A `none` or `text` command with `x.remote.profile` can emit a Cherri SSH
  Shortcut from a private profile; `none` can additionally emit a Termux
  shortcut script.
- The remote host accepts only protocol 1, explicit remote targets, the emitted
  command grammar, and valid modality input.
- No `args` or files command emits a remote launcher.
- Unit tests prove source-body exclusion, profile-bound emission, and host
  rejection of malformed or unauthorized requests.
