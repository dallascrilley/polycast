# iPhone device-fabric Shortcuts (WKS-1420 / WKS-1546)

[WKS-1420](https://linear.app/dallascrilley/issue/WKS-1420/add-four-bounded-iphone-device-fabric-shortcuts)
asks for exactly four iPhone actions, **Agents**, **Reviews**, **Agent
Console**, **Send to Device**, that reach the existing Mac fleet without
embedding a bearer token, an SSH key, or an arbitrary shared command. WKS-1546
gives Polycast the Cherri-backed source of truth plus the equivalent universal
local scripts.

## Why native, not the shell dispatcher

Every other `shortcuts-cherri` command compiles to a `runShellScript` call into
`polycast run`. These four do not: `x.shortcuts.workflow` on `CommandDef`
(`src/types.ts`) replaces that dispatcher with a bounded, ordered list of
native Cherri actions. The command's `body` remains the universal
local/remote script other targets (`agent-cli`, `raycast-script`, and so on)
still use; `shortcuts-cherri` ignores it whenever `workflow` is present.

| Step kind | Compiles to | Why |
|---|---|---|
| `require-reachable` | `downloadURL(url)` | A private `*.tail*.ts.net` route only resolves and responds when Tailscale is connected, so a failed request halts the Shortcut with iOS's own error UI before any private route opens. This is the Tailscale preflight WKS-1420 requires, with no Tailscale-specific action needed. |
| `open-url` | `openURL(url)` | `url` is ordinary committed source, a PWA route or a fixed `blinkshell://` callback, never a secret. |
| `open-console` | `openURL("blinkshell://run?key=...&cmd=mosh <alias>")` | Resolves a named private `ConsoleProfile`; the command definition names only the profile, never the Blink URL key or host alias. |
| `native-capture` | `rawAction(identifier, params)` | Resolves a named private `CapturedAction`, see below. |

## Agents and Reviews

Both compile to: reachability check against
`https://dallas-macbook.tail16923a.ts.net:8445/health`, then `openURL` to the
authenticated PWA (`/agents` or `/reviews`). Neither embeds a bearer token,
the PWA owns its own session, and neither requires any private local
configuration, so they build everywhere.

## Agent Console

Constraint: "invokes only the saved mosh/SSH profile; it does not run
arbitrary shared text." [Blink Shell](https://blink.sh) is the iPhone's
existing certified terminal (its device key is the "dallas-iphone-blink"
1Password item referenced from `~/.ssh/config`), and it documents a
[X-Callback-URL scheme](https://github.com/blinksh/blink/discussions/1592):
`blinkshell://run?key=<url-key>&cmd=<command>`. The `open-console` step emits
that URL with a **fixed** `cmd=mosh <hostAlias>`. `<hostAlias>` names a host
already saved in Blink's own on-device Hosts configuration, so this Shortcut
never carries a hostname, user, or key material, and the command it runs is
never dynamic or shared text.

`shortcuts-remote-ssh` and `termux-shortcut` never gain an Agent Console
launcher (the command carries no `x.remote`): Polycast's own SSH dispatcher is
deliberately not this action's route.

### Private console profile

The build reads `POLYCAST_CONSOLE_PROFILES` or, by default,
`~/.config/polycast/console-profiles.json`:

```json
{
  "version": 1,
  "profiles": {
    "dallas-macbook": {
      "blinkKey": "the-url-key-from-blinks-x-callback-url-settings",
      "hostAlias": "the-host-alias-already-saved-in-blink"
    }
  }
}
```

`blinkKey` authorizes local inter-app automation only (Blink's own X-Callback
URL setting: `config` then `X-Callback-URL` then `Allow URL actions` then
`URL Key`); neither field is an SSH credential. Without this file,
`shortcuts-cherri` **skips** Agent Console for that one command instead of
failing the whole build, see "Skip, don't fail" below.

## Send to Device

Constraint: "uses Tailscale's native Send File/Taildrop action and requires
explicit destination selection." Taildrop-to-a-peer is Tailscale-app
functionality; no generic Shortcuts action can represent it, and Tailscale's
iOS app is closed source, so its App Intent identifiers are not publicly
documented. Cherri's raw-action escape hatch
(`docs/guides/native-action-capture.md`) is the only way to author it, and it
requires a real device capture first.

### Private native action capture

The build reads `POLYCAST_NATIVE_ACTIONS` or, by default,
`~/.config/polycast/native-actions.json`:

```json
{
  "version": 1,
  "actions": {
    "tailscale-send-file": {
      "identifier": "is.workflow.actions.appintent",
      "params": { "WFInput": "${@shortcutInput}" }
    }
  }
}
```

See `docs/guides/native-action-capture.md` for how to produce this file.
Without it, `shortcuts-cherri` skips Send to Device for that one command; the
native action itself always prompts Shortcuts' own destination picker, so
Polycast never selects a device.

The universal script counterpart (`commands/send-to-device.ts`, used by every
other target) enforces the same rule outside Shortcuts: it reads
`POLYCAST_SEND_TO_DEVICE_TARGET` or prompts interactively, and refuses to run
`tailscale file cp` without an explicit destination.

## Skip, don't fail

Command definitions never contain Blink or native-action secrets, only a
profile or capture *name*. Not having captured one yet is a legitimate,
un-committed local build state, not a build failure: `console-profiles.ts`
and `native-action-capture.ts` throw `MissingPrivateConfig`
(`src/private-config.ts`), and `shortcuts-cherri.emit()` catches exactly that
class to skip the one command/target instead of failing every other command's
build. Any other error (malformed JSON, a schema violation) still fails loud.
