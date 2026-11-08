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
- **Check a camera invariant after any pacing change.** Tripling the early levels made the fish bigger sooner, and the view then needed more sea than the level had, so the 25% zoom capped out at level 6. The sea width now comes from the largest fish of each level. Check it with a short node script that reads `levelInfo` (see the sea-width calculation in the 0.11 PR) before trusting a playtest.
- **A state default can hide a bug until a level change.** The first level's goal was hard-coded at 2 in the run's start object, so the HUD showed the wrong goal until the first level-up. Read the start state once after a run begins, not only after growth.
- **Test targets must survive the test.** A small test fish next to a big ally died within a frame, so the Attack check saw no target. Use a target bigger than the ally, and click straight after placing it.
- **Give a flaky check retries, and print both results.** Allies die fast in a busy sea, so one attempt at a heal or Attack check often fails for reasons unrelated to the change. Retry the setup (buy an ally again), and print the numbers that explain a skip or a fail.
- **Equal specificity: the later rule wins.** The 0.11 tablet size for the mini map sat above the base `.minimap` rule, so the base rule won and the map stayed 170 px on an iPad. Put size overrides after the base rule, and check the rendered size with `getBoundingClientRect` in the playtest, not by reading the CSS.
- **A size-band spawner hides small species.** Prey are picked when their size is 25–85% of yours, so a shrimp (size 0.9) never appears past level 2. Place scenery and small food by level (counts per level, gated by tier), as the creatures are.
- **A `harmless` flag does not stop a bite.** `checkContact` fell through to the bite code for any fish without a sting, so you could eat a turtle. The check now tests what the rule says: bite a harmless creature for four seconds and it must still be there.
- **A level-up pauses spawns.** The calm stops new fish for five seconds, so a test that polls for a new species right after a level change sees nothing. Wait out the calm, or set the level before the check.
- **A test that copies a game formula drifts.** The camera check had its own copy of the fish length (`22 + 5 × size`); when `fishLen` changed, the check reported a fish 4.6× bigger on screen while the game was right. The playtest now loads `js/species.js` (`GAME_DATA`) and uses the game's own functions.
- **Random forms break tests that assume a species.** Once your form is picked at random, a test that spawns "a round fish like you" by name fails at random. Spawn your own form (`state().form`) instead.
- **A fix can be merged and still not reach the device.** "I can't eat anything at levels 1-2" came after the fix was merged, while a bot grew to level 2 in under a minute. Both builds said v0.11, and the scripts had no cache stamp, so a device could keep the old `game.js`. Every script and style link now carries `?b=` + `CONFIG.BUILD`, and the title shows the build. Ask which build the device shows before chasing a bug that tests cannot reproduce.
- **Never type a commit SHA into a merge.** A made-up SHA was rejected, but only because GitHub refused it for the conflicts first. Take the full SHA from `git rev-parse HEAD` each time.
