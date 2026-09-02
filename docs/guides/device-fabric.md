# iPhone device fabric

Polycast owns four bounded iPhone actions. The Cherri files under
`shortcuts/device-fabric/` are their canonical, reviewable sources:

| Shortcut | Input | Effect |
|---|---|---|
| **Agents** | None | Connect Tailscale, then open the authenticated `/agents` PWA route. |
| **Reviews** | None | Connect Tailscale, then open the authenticated `/reviews` PWA route. |
| **Agent Console** | None | Connect Tailscale, then open the fixed `ssh://agent-console` saved profile. |
| **Send to Device** | Shared files | Connect Tailscale, ask for a Taildrop destination, then send the files to that selected device. |

There is intentionally no **Drop Task** action. Agent Console never consumes
shared text or accepts a command. Its only variable state is the separately
saved SSH/mosh profile.

## Build and install on iPhone

Requirements on the build Mac:

- Bun and this Polycast checkout or linked package.
- [Cherri](https://github.com/electrikmilk/cherri).
- The macOS `shortcuts` and `plutil` CLIs.

Build all four sources and signed exports:

```sh
polycast device list
polycast device build
```

The build fails unless the source directory contains exactly the four files
listed above and each declares its exact Shortcut name. It always exports owned
`.cherri` source files to `build/device-fabric/`. With all macOS build tools
present, it also emits signed `agents.shortcut`, `reviews.shortcut`,
`agent-console.shortcut`, and `send-to-device.shortcut` files. Builds and tests
never import them automatically.

Transfer those four `.shortcut` files directly to the intended iPhone, open
each file, and accept the Shortcuts import. Remove any previous **Drop Task**
shortcut manually; Polycast neither emits nor imports it. After import, confirm
that Shortcuts shows exactly **Agents**, **Reviews**, **Agent Console**, and
**Send to Device**.

Each source uses Tailscale's native `ConnectIntent`. Polycast compiles the
Cherri source without signing, repairs Cherri's nested-dictionary encoding to
the native AppIntent descriptor shape, verifies the Connect and Taildrop
parameters, and then signs the result with `shortcuts sign --mode
people-who-know-me`. This preserves Cherri as source while producing native iOS
AppIntent actions instead of macOS shell actions.

## iPhone prerequisites

1. Install Tailscale on the iPhone and sign in to the authorized tailnet.
2. Confirm the Mac serves the authenticated PWA routes at:
   - `https://dallas-macbook.tail16923a.ts.net/agents`
   - `https://dallas-macbook.tail16923a.ts.net/reviews`
3. In the chosen iOS terminal, save an SSH profile named `agent-console` and
   configure that app to handle the `ssh://` URL scheme. Keep host identity and
   authentication in the saved profile; never put a password, private key,
   bearer token, command, or callback key in the Shortcut URL.
4. Enable Taildrop for the intended devices. **Send to Device** uses the native
   Tailscale destination picker, so destination choice is explicit on every
   run.

Tailscale documents its Shortcuts actions and Taildrop **Send File** behavior
in [Tailscale Shortcuts for iOS and macOS](https://tailscale.com/docs/features/mac-ios-shortcuts).

## Universal local entry points

The same action IDs run through the installed `polycast` binary or the
`polycast-device-fabric` bin alias:

```sh
polycast device run agents --target local
polycast device run reviews --target local
polycast device run agent-console --target local
polycast device run send-to-device --target local --destination tablet -- ./receipt.pdf
```

`--target` is mandatory. Every action first parses `tailscale status --json`
and requires `BackendState` to be `Running`. PWA routes must remain HTTPS
`.ts.net` URLs with the exact `/agents` or `/reviews` path and no URL credentials,
query, custom port, or fragment. Taildrop requires one or more regular files and
an explicit safe destination name.

Agent Console defaults to `ssh agent-console`. A host may select a different
saved profile or mosh without expanding the action into a command runner:

```sh
export POLYCAST_DEVICE_FABRIC_CONSOLE_TRANSPORT=mosh
export POLYCAST_DEVICE_FABRIC_CONSOLE_PROFILE=agent-console
polycast device run agent-console --target local
```

Profile names accept only letters, digits, dot, underscore, and hyphen. No
extra positional, destination, or shared-text input is accepted.

## Authorized remote host entry points

Remote routing uses saved SSH profile names, never an arbitrary host string.
Allow each profile explicitly on the client:

```sh
export POLYCAST_DEVICE_FABRIC_REMOTES=work-mac,tablet
polycast device run reviews --target work-mac
```

The client preflights its own Tailscale connection, invokes only the fixed
remote command `polycast device receive --forced`, and sends a versioned JSON
envelope on stdin. The receiver rejects any other `SSH_ORIGINAL_COMMAND`,
action ID, payload field, or input shape, then performs its own Tailscale
preflight before dispatch.

Install Polycast on the remote host and bind the relevant public key to the
fixed receiver in `authorized_keys`:

```text
command="polycast device receive --forced",restrict ssh-ed25519 <public-key>
```

Keep the key and host details outside Git. For a remote **Send to Device** run,
file paths name files already present on that remote host; the bounded JSON
protocol does not tunnel file content or shell source.

Failures are explicit and nonzero: Tailscale unavailable/stopped, malformed PWA
route, unknown action, missing Taildrop destination/file, invalid saved profile,
unallowlisted remote, mismatched forced command, or a failed platform tool.

## Relationship to WKS-1420

WKS-1420 defined the product boundary: use the iPhone for triage, quick actions,
and handoff while keeping reasoning-heavy work on Mac agents. This device
fabric is the implementation layer for that boundary. **Agents** and
**Reviews** open the stable authenticated PWA surfaces; **Agent Console** enters
one saved terminal profile without becoming a general command surface; **Send
to Device** moves files through native Taildrop with explicit destination
selection. The universal entry points preserve the same four bounded effects
when invoked on an authorized local or remote host.
