# Fishes — Lessons

- Keep the data shape the same for every entity the draw loop touches. NPCs carry `sp` and the player carries `desc`; the draw code read `desc` for both, so every NPC threw an error each frame. A try/catch hid it, so check the error strip after each render change.
- Keep predators well above the size a level's player starts at. If a hunter is only about 1.3× the player, it stops being a threat after one or two meals.
- Eating growth (40% of prey size) makes tiers pass in a few bites. Tune this before anything else, because it sets the run length.
- Tie the spawner to the player's size, not to fixed species counts. Choose each new fish from a size band relative to the player, then choose its role by ratio. The difficulty setting then stays true as the player grows.
- Only fish that can actually hurt the player should count as threats. A wary prey fish that is bigger than you does not hurt you; counting it as a threat made the ratio lie.
- Headless checks: drive with `window.FishGame.debugSetSize` and the state hook, and read the census from the hook, rather than waiting for random encounters.
- A `file://` page can't store cookies in headless Chromium. Serve the folder over HTTP to test cookie notes.
- Test a spawn rule by counting what it produced, not by reading it. A "threat" that can't hurt the player (a wary prey fish that is bigger than you) made the ratio read wrong until it was classified by what it can do.
- The Family database is reached through a sandbox proxy that may block `supabase.co` from the browser. Verify access rules through the Supabase tools (grants, RLS policies) and leave the live sign-in to a device test.
- Take the species table in the schematic from the data (a short node script), not by hand, so the design doc can't drift from `js/species.js`.

## Working process (added 2026-11-05)

- **Fetch before you branch.** A `git checkout -B main origin/main` with no fetch used a copy weeks stale. Work silently vanished from the local tree, and allies looked broken until the branch was rebased on the real `origin/main`. Start every task with `git fetch origin`, and check `git log -1 origin/main` against the last merged PR.
- **Each merge changes the game the next PR tests.** Re-run the playtest on the current `main` before reporting a bug. Two false alarms this session came from stale code.
- **Test rules, not sequences, when the sim is random.** A new ally can die within a second of spawning. Assert "price = living allies + 1" and "a buy charges the price shown", not "the price reads 1, 2, 3, 4".
- **`em` in a child resolves against the child's own font size.** A button sized `4.5em` with its icon at `1.8em` came out 8× the intended size. Put the scale on a container and size children from it.
- **Keep scope tests off the game's closure.** `window.FishGame` sits outside the setup closure, so it can't call `liveAllies()`. Compute inline, and keep the formula in one comment that points at the real function.
- **Level changes and growth checks belong outside tight loops.** `checkGrowth` can call `enterLevel`, which replaces the NPC list. Ally EXP sets a flag, and the main loop runs the check after the NPC update.
- **GitHub merges need the PR marked ready first.** A draft refuses the merge with a 405. Pin the merge with `expectedHeadSha` so a late push can't slip in.
- **PRs have shipped without a changelog line.** Add the `CHANGELOG.md` entry in the same PR as the change.
- **The version label is read from `CFG.VERSION`.** The title and settings show the version from `js/species.js`. The HTML placeholders are overwritten at startup, so don't trust them.
- **Ask for a device check on anything touch-related.** Headless Chromium proves layout and rules, not iPad feel. Each report should say what was not tested.
- **Balance numbers are guesses until a timed run.** Name them as guesses (leash 300px, EXP share 50%) and ask for a play test before tuning.
- **Measure spending with a counter, not with size.** The ally price check read size before and after a 60 ms window, and a meal or an ally's EXP share in that window read as a wrong charge. The game now keeps `allySpent`, and the check reads that.
- **Test a fight from both ends.** The first fight test showed the bigger fish taking bites but never biting back. The cause was the player's start invulnerability (2.5 s), which used up the fish's first bite, plus the current carrying the player out of reach. Wait out the invulnerability, and hold the player beside the test fish, before reading the damage.
