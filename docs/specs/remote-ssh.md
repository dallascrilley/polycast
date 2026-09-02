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
`~/.config/polycast/remote-profiles.json`. Keep this file and the referenced
identity file private and outside the repository.

```json
{
  "version": 1,
  "profiles": {
    "primary-mac": {
      "host": "private-host.example",
      "port": 22,
      "user": "operator",
      "transport": {
        "kind": "ssh-key",
        "identityFile": "/private/path/to/id_polycast_ios"
      }
    }
  }
}
```

Version 1 generates SSH-key Cherri profiles only. It deliberately does not
model password authentication, sudo passwords, arbitrary SSH options, or a
general-purpose SSH configuration. The compiled remote Shortcut and its Cherri
source contain transport material, so `build/shortcuts-remote-ssh/` is ignored
credential-bearing output: transfer it directly to the intended device and do
not commit, share, or import it into the Mac's local Shortcuts library.

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

Termux output invokes the existing `mac-exec` command. Polycast does not create
or alter a second Android SSH configuration. Remote version 1 has no sudo or
privileged-service facility.
