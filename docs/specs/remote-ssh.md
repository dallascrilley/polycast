# Remote SSH shortcuts

Remote execution is an opt-in extension of an ordinary `CommandDef`. The local
launcher remains unchanged. Add `x.remote.profile` to also build a separate
`<title> Remote` Shortcut and a Termux shortcut script when the command's
modality is `none` or `text`.

```ts
export default defineCommand({
  id: "tablet-mic-start",
  title: "Start Tablet Mic",
  description: "Start the Mac-side microphone bridge.",
  modality: "none",
  x: { remote: { profile: "primary-mac" } },
  body: { lang: "bash", source: "exec your-canonical-command" },
});
```

`x.remote` contains only the profile name. It must never contain a host, port,
user, password, key material, or body source. A command that omits it does not
produce remote artifacts and is rejected by the remote host entry point.

## Private build profile

The build reads `POLYCAST_REMOTE_PROFILES` or, by default,
`~/.config/polycast/remote-profiles.json`. Keep this local connection metadata
private and outside the repository.

```json
{
  "version": 1,
  "profiles": {
    "primary-mac": {
      "host": "private-host.example",
      "port": 22,
      "user": "operator",
      "transport": {
        "kind": "ssh-key"
      }
    }
  }
}
```

Version 1 generates SSH-key Cherri profiles only. It deliberately does not
model password authentication, private-key import, sudo passwords, arbitrary
SSH options, or a general-purpose SSH configuration. The imported Shortcut must
generate or select its device-owned SSH key, then its copied public key must be
added to the host's forced `authorized_keys` entry. The build output contains
private connection metadata, so keep `build/shortcuts-remote-ssh/` out of Git
and transfer it only to the intended device.

## Wire and host boundary

The remote Shortcut sends this fixed remote command and uses SSH stdin for text
input:

```text
polycast-remote --command <command-id> --protocol 1
```

The host must use a dedicated device key constrained in `authorized_keys` with
a forced command equivalent to:

```text
command="/absolute/path/to/polycast remote --forced --commands /absolute/path/to/.polycast/commands",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... tablet-polycast
```

The forced entry runs `polycast remote --forced`; it accepts only the exact
`SSH_ORIGINAL_COMMAND` grammar above, reads no shell source, loads the stored
command JSON, requires the command's explicit remote opt-in, and supports only
`none` (empty stdin) and UTF-8 `text` (at most 64 KiB). `args` and files are
rejected until their JSON-envelope and transfer semantics are designed.

Termux output invokes the existing `mac-exec` command. It currently supports
only `none`: Termux:Widget has no defined text-entry/stdin contract. Polycast
does not create or alter a second Android SSH configuration. Remote version 1
has no sudo or privileged-service facility.
