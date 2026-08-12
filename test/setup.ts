// Preloaded by `bun test` via bunfig.toml.
//
// The build's Cherri compile step shells out to a real `cherri` binary. Tests
// assert structure, not compiled Shortcuts, so default the skip flag on — for
// this process and every subprocess it spawns. An explicit
// POLYCAST_SKIP_CHERRI=0 still wins, so a local Cherri run stays possible.
process.env.POLYCAST_SKIP_CHERRI ??= "1";
