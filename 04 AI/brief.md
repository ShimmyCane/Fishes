# Fishes — Brief (AI notes)

**Updated:** 2026-11-03

## Current state

- Plain HTML/CSS/JS canvas game in `03 Projects/Fishes/`. No build step. Not device-tested on iPad.
- **20 tiers** (one per level, five depth zones), **88 species** (3–8 per tier, food included). Each species has a **temper**: docile (never attacks or locks on), wary (hunts smaller fish, ignores you when smaller, no lock-on), aggressive (hunts smaller fish, locks on to you when smaller).
- **Evolution:** the player takes its tier's lead species (first listed for the tier). Banner "Evolved into …".
- **Fish eat fish:** a non-docile fish ≥1.25× bigger eats a smaller fish it touches, and hunters hunt smaller fish nearby.
- **Adaptive sea:** predators come from 1–3 tiers above the player, prey from 0–3 tiers below (or the same tier). Size still decides who is a threat (≥1.1× you, non-docile, can hurt you) or edible (≤0.87× you). Fallback to any size-fitting species if the window is empty.
- **Difficulty = predator:prey ratio** (title screen): Easy 1:4 (20% predators), Medium 1:2 (33%), Hard 1:1 (50%). Up to +50% from 2:30 (capped at 70%).
- Win at size 100 on tier 20. Ends on three lives lost, win, or 15:00. The end card says what ate you.
- **Round 5 (v0.7):** growth = max(prey size × 0.25, level size range ÷ 9), so a level takes at most about nine fish meals (plankton and chum keep size × 0.4). From level 10 a pod of your own species follows you (2 to 12), bites prey up to 0.85× its size, grows at half your size, and has a 50% chance of a new member when you eat chum near it. Pods are left out of the population counts, and they neither hurt nor get eaten by you. Tested: pods appear at level 10 (2), no page errors. Growth cap not yet timed over a full game.
- **Round 4 (v0.6):** level up keeps nearby fish (no arrivals), background fades 2 s between zones; eating from level 2 at 0.25×0.1 of prey size (level 1 unchanged at 0.4); fish of size ≥4 have 2–5 bites; schools bite back; predators 2.5× size scatter prey (420 range, 2.2× speed); predators gather at chum; dead fish of size ≥4 break into up to 12 chum bits (size/4); plankton and chum eaten on contact; plankton base 70 on tier 1. Known risk: growth is about 10× slower from level 2, so runs will likely pass the 15-minute cap; check with a timed run before tuning.
- **Round 3, part 2 (v0.5):** joystick or tap control (setting), phone view 2.5×, pinch zoom off, bite timer ring, red splashes, wounded fish draw attackers, livelier fin and tail, eating gain 25% (was 40%), world grows 420×260 per tier, fish speed +3% per tier, arrivals from the edges with no contact for 6 s, infinite mode (goal ×1.25 after tier 20), end-game button. Tests: joystick moves the fish (233 px in one drag), phone camera 2.5× the old phone scale, arrivals counted after level-up, infinite on/off at size 100, end-game card, no page errors.
- **Combat (v0.4):** bites with a per-attacker pause. Attack = 1 + floor(size/8); fish health = max(1, round(size/3)); player health = 10 + floor(size/2), regenerating after 4 s without a hit. Player bite pause 0.6 s, fish 0.9 s. Losing all health costs a life, as before. Chum: 25 s, dropped by fish of size ≥4 when they die. Tests: small fish go in one bite, large fish take several, chum seen in play (max 19 in a headless run), no page errors.
- **Notes to the cloud (v0.3):** each note is kept on the device with an unsent flag and sent when saved while signed in; unsent notes go up at sign-in. v0.4 sends one batch at a time so a note cannot be posted twice.
- **Family database:** `fish_notes` is live in the Family project (migration `fishes_fish_notes`). Sign-in is the same family account as Expansion Wars, via ⚙️ → Family database. Session tokens are kept on the device; the password is not. Notes always save to the cookie first (25 kept), then to the family table when signed in.

## Architecture

- `js/species.js`: `FishData` (SPECIES with `tier`/`temper`/`kind`, ZONES, GOALS, LEVEL_NAMES, DIFFICULTY, levelInfo, leadOf, CONFIG incl. the Family URL and publishable key).
- `js/game.js`: simulation (`fillPopulations`, `census`, `spread`, `pickSpecies` with tier windows, `pickRole`, `canHurt`, `isThreat`, `isEdible`), NPC AI in `updateNPC` with `findPrey`, fish-eat-fish in `update`, drawing, input, panel. Test hook `window.FishGame.state()` (census, spread, npcEaten, form, difficulty) and `debugSetSize(n)`.
- `js/family.js`: `FishFamily` (signIn, signOut, token with refresh, onChange). Password is sent to Supabase only.
- `js/notes.js`: `FishNotes`. Cookie plus localStorage fallback; sends with the family token, refreshing once on 401/403.
- `js/sound.js`: `FishSound`. Created on first touch.

## Verified vs. unverified

- Verified (headless Chromium, served over HTTP, no page errors):
  - Species per tier: 4,5,4,5,5,5,5,5,5,4,5,4,5,4,4,4,5,4,3,3 (total 88).
  - Predator share at tier 5 / tier 10: easy 0.22 / 0.22, medium 0.34 / 0.33, hard 0.46 / 0.49.
  - Spawn spread at tier 10 (medium): 24 below, 3 same, 13 above. The prey and predator windows are working.
  - Fish eat fish, evolution, level jumps and the win state (earlier round).
  - Family panel: a wrong password is refused and shown on the page; the note is kept in the cookie and the status reads "needs family sign-in".
- Live database checks (Supabase MCP, not the browser): rolled-back test returned `note_saved=t bad_row_rejected=t delete_denied=t anon_denied=t`; the real migration applied; RLS on; `anon` has no grants; `authenticated` has INSERT and SELECT.
- **Not verified:** a successful family sign-in and a note landing in the table. The sandbox cannot reach `supabase.co` from the browser, so this must be done on the iPad by Jimmy.
- Unverified: run length (8–15 minutes); balance of predator sizes per tier; iPad touch feel; how docile fish read on screen.

## Next steps

1. Jimmy signs in on the iPad (⚙️ → Family database) and saves a test note. Check it in the family table.
2. Play one full run per difficulty; time it against 8–15 minutes and note unfair moments in ⚙️.
3. Tune: prey gain (0.4 of prey size), tier windows (currently 1–3 tiers), fish target (22 + 2×tier), threat cap (70%).
