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
