# Capturing a third-party native Shortcuts action

Some Shortcuts actions belong to a third-party app's own App Intent extension
(Tailscale's Send File/Taildrop, for one). Apple does not publish third-party
App Intent identifiers, and Cherri's standard library has no built-in wrapper
for one, so Polycast cannot originate this data on its own. It has to be
captured once, by hand, from a real device.

This is the same reason [WKS-1420](https://linear.app/dallascrilley/issue/WKS-1420)
stayed blocked on an automated agent: authoring a third-party native action
requires the real Shortcuts app's own action picker, which only exists on a
real device.

## Procedure

1. Open the Shortcuts app on any Apple device signed into the target app
   (Tailscale, for the `tailscale-send-file` capture this repository ships a
   command for).
2. Create a new, throwaway Shortcut. Add the target app's native action from
   the app picker (for example: search "Tailscale", add **Send File**). Add
   nothing else.
3. Save it, then share/export it as a `.shortcut` file to a Mac (AirDrop,
   iCloud Drive, Files app, and so on).
4. On the Mac, with [Cherri](https://github.com/electrikmilk/cherri)
   installed, decompile it:

   ```sh
   cherri decompile path/to/exported.shortcut
   ```

   Cherri prints the `rawAction(identifier, { ... })` call (or an
   `action '<identifier>' name(...)` definition) it recovered for the action.
5. Copy the identifier and its parameter dictionary into
   `~/.config/polycast/native-actions.json` (or the path
   `POLYCAST_NATIVE_ACTIONS` points at) under the capture name a `CommandDef`
   references via `x.shortcuts.workflow`'s `native-capture` step:

   ```json
   {
     "version": 1,
     "actions": {
       "tailscale-send-file": {
         "identifier": "<decompiled WFWorkflowActionIdentifier>",
         "params": { "...": "..." }
       }
     }
   }
   ```

6. If the action should receive the Shortcut's Share Sheet input dynamically
   (Send File wants the shared file, not a literal path), replace the
   decompiled literal value with a `${@shortcutInput}` reference in the param
   that carried it. `shortcuts-cherri`'s native workflow always declares
   `@shortcutInput = ShortcutInput` immediately before running any captured
   action for a `text` or `files` command, so that reference resolves.
7. Delete the throwaway on-device Shortcut and the exported file; neither
   should be kept once the capture is copied out. Nothing in this file is a
   credential (it is a plist-level action shape), but it is still
   device/app-version-specific and does not belong in Git.

## Verifying a capture

```sh
POLYCAST_NATIVE_ACTIONS=~/.config/polycast/native-actions.json \
  bun run dev build --target shortcuts-cherri --strict
```

`send-to-device.cherri` (or whichever command references the capture) should
now emit a `rawAction(...)` line and, with `cherri` on PATH, compile to
`send-to-device.shortcut`. Import that file manually
(`apply --write --import-shortcuts`) and run it once on a real device to prove
the captured identifier and parameters actually work; a successful Cherri
compile only proves the shape parses, not that iOS accepts it.
