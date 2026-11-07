# Fishes — Schematic

**Status:** MVP (not yet device-tested)
**Owner:** Jimmy
**Platform:** iPad web app (plain HTML/CSS/JS, canvas, no build step, GitHub Pages later)
**Conversation:** `convo/convo v0.1.md`

## Purpose

A game inside a fish tank that becomes the ocean. You start as a baby fish eating plankton, grow by eating smaller things, and finish as the largest fish ever (a whale shark). It is not realistic, but the fish are inspired by real fish. The sea goes deeper and bigger level by level. Other fish can lock on to you, and it gets harder after 2:30.

## Goal and ending

- Grow from size 1 to **size 100 on level 20** to win (the whale shark).
- **Lose** when you have no lives left (eaten three times).
- **Time's up** at 15:00 (hard stop).
- Typical run target: **8–15 minutes** (not yet measured; see `04 AI/Fishes/brief.md`).

## Controls

- **Swim:** hold your finger (or mouse) on the sea. The fish swims toward it. Arrow keys / WASD work on a computer.
- **Sprint:** hold 💨 (lower left), or Shift / Space. It doubles speed and uses stamina, which refills when you stop.
- **Settings and notes:** ⚙️ (lower right) — sound, show errors, notes, database status.

## Rules

- **Size** starts at 1. Plankton (+0.1 each) and other fish grow you by 40% of their size when you eat them. You can eat a fish that is at most 87% of your size (you must be 1.15× bigger).
- **Being eaten:** a non-docile hunter or ambusher that is at least 1.1× your size costs one life. You shrink to 75% of your size (not below the level's start) and respawn in the middle with 3 seconds of protection.
- **Lives:** 3.
- **Pufferfish** (spines): eating one costs size. Other fish learn to avoid it by appearance, not by rule.
- **Lock-on:** an *aggressive* hunter that is bigger than you and within sense range can lock on (chance per second rises with tension). A red ring marks it and a warning shows at the top. The lock lasts 7–9 seconds, or until you are out of range (twice the sense range) or no longer its prey. Then the hunter cools down for 4 seconds.
- **Ambushers** (grouper, moray, anglerfish) wait, then lunge when you are smaller and close.
- **Harmless** fish (sunfish, oarfish, megamouth, whale shark) drift. You can eat them when you are big enough.
- **Tension:** 0 until 2:30, rising to full at 5:00. Hunters and ambushers become more numerous, and locks are more likely.

## Tiers, evolution and the food chain

Twenty tiers (one per level), in five depth zones. The play area grows with each tier, from 3200 × 2000 to 19570 × 12230. The camera zooms out as you grow: with the level (about 10% more sea a level) and with your size.

- **Evolution:** each tier has a lead species. On reaching a tier you take its form (banner: "Evolved into …"). Tier 1 is a guppy; tier 20 is a basking shark.
- **3–8 species per tier** (88 in total, food included), each with a temper:
  - **docile** never attacks and never locks on. It flees bigger fish. (Guppy, herring, angelfish, sunfish.)
  - **wary** hunts smaller fish, ignores you when you are smaller, and flees when you are bigger. It does not lock on. (Dottyback, cleaner wrasse, sailfish, goblin shark.)
  - **aggressive** hunts smaller fish and locks on to you when you are smaller. (Bonito, barracuda, bluefin tuna, reef shark, great white, blue marlin.)
- **Fish eat fish.** A non-docile fish at least 1.25× bigger eats a smaller fish it touches, plankton included. Docile fish are never eaten by the player's rule, but they can still be eaten by a bigger predator.

| Tier | Zone | Size to leave | Species (temper) |
|---|---|---|---|
| 1 Sunny Cove | Sunny Shallows | 2 | Guppy (docile) · Neon tetra (docile) · Zebrafish (docile) · Plankton (food) |
| 2 Sea-grass Flats | Sunny Shallows | 3 | Clownfish (docile) · Goby (docile) · Blenny (docile) · Dottyback (wary) · Krill (food) |
| 3 Rock Pool Edge | Sunny Shallows | 4 | Cleaner wrasse (wary) · Herring (docile) · Sardine (docile) · Hawkfish (wary) |
| 4 Sandy Shelf | Sunny Shallows | 5 | Anchovy (docile) · Pufferfish (docile) · Butterflyfish (docile) · Sergeant major (docile) · Cardinalfish (docile) |
| 5 Coral Gardens | Coral Reef | 7 | Parrotfish (docile) · Blue damselfish (wary) · Moray eel (aggressive) · Scorpionfish (wary) · Sea chub (docile) |
| 6 Anemone Bay | Coral Reef | 9 | Angelfish (docile) · Blue tang (docile) · Lionfish (wary) · Trumpetfish (wary) · Porcupinefish (docile) |
| 7 Reef Wall | Coral Reef | 11 | Mackerel (wary) · Triggerfish (docile) · Bonito (aggressive) · Sweetlips (docile) · Snook (wary) |
| 8 Parrot Lagoon | Coral Reef | 14 | Grey mullet (docile) · Rockfish (docile) · Red snapper (wary) · Bluefish (aggressive) · Grouper (wary) |
| 9 Open Blue | Open Blue | 17 | Jack (wary) · Pompano (docile) · Amberjack (wary) · Trevally (wary) · Barracuda (aggressive) |
| 10 Tuna Run | Open Blue | 21 | Mahi-mahi (wary) · Bonefish (docile) · Yellowfin tuna (wary) · Bluefin tuna (aggressive) |
| 11 Shark Lane | Open Blue | 25 | Rainbow runner (docile) · Cobia (docile) · Dogtooth tuna (wary) · Sailfish (wary) · Reef shark (aggressive) |
| 12 Wide Water | Open Blue | 30 | Sea bream (docile) · Permit (docile) · Wahoo (aggressive) · Striped marlin (wary) |
| 13 Twilight Shoal | Twilight | 36 | Lanternfish (docile) · Hatchetfish (wary) · Lookdown (docile) · Opah (docile) · Snake mackerel (wary) |
| 14 Lantern Drift | Twilight | 43 | Escolar (wary) · Ocean sunfish (docile, harmless) · Anglerfish (aggressive) · Lancetfish (wary) |
| 15 Angler Shelf | Twilight | 50 | Pomfret (docile) · Sablefish (docile) · Thresher shark (wary) · Swordfish (aggressive) |
| 16 Slope Edge | Twilight | 58 | Oilfish (docile) · Cusk eel (docile) · Hammerhead (wary) · Gulper eel (aggressive) |
| 17 Deep Trench | Deep Trench | 67 | Viperfish (wary) · Tripodfish (docile) · Coelacanth (docile, harmless) · Oarfish (docile, harmless) · Frilled shark (wary) |
| 18 Oar Valley | Deep Trench | 77 | Goblin shark (wary) · Megamouth shark (docile, harmless) · Sixgill shark (wary) · Great white (aggressive) |
| 19 Abyss Mouth | Deep Trench | 88 | Greenland shark (wary) · Blue marlin (aggressive) · Sand tiger shark (docile) |
| 20 Whale Ocean | Deep Trench | 100 | Basking shark (docile, harmless) · Whale shark (docile, harmless) · Giant sunfish (docile, harmless) |

Each species' real-fish note is in `js/species.js`.

## Round 5 rules (v0.7)

- **Growth:** a fish meal gives max(prey size × 0.25, level size range ÷ 9), so a level takes at most about nine meals. Plankton and chum give size × 0.4.
- **Your school (level 10 on):** a pod of your own species follows you within about 90 units. It bites prey up to 0.85× its size (within 220 units) and grows with you at half your size. There are 2 at level 10, rising to 12 at level 20. Eating chum within 240 units of the pod gives a 50% chance of a new member, up to 12.
- The pod does not hurt you, you cannot eat it, and it is left out of the population counts.

## Round 4 rules (v0.6)

- **Level up:** the fish around you stay. The background fades to the new zone over two seconds. New species appear far away, gradually.
- **Growth:** from level 2, a fish meal gives 0.25 × 0.1 = 0.025 of the prey's size (was 0.25). Level 1 keeps 0.4 of the prey's size, and plankton is plentiful.
- **Hit points:** fish of size 4 or more have max(2, round(size/2)) health, so 2 to 5 bites. Smaller fish have max(1, round(size/3)).
- **Schools:** a bitten school fish calls on its schoolmates within 220 units. They bite back at the attacker (the player included) when their bite is ready.
- **Scatter:** a predator 2.5× a fish's size makes it flee from 420 units, at 2.2× speed.
- **Chum:** predators within 300 units go to chum. A dead fish of size 4 or more breaks into up to 12 pieces (size / 4), lasting 25 seconds.

## Controls, screen and modes (v0.5)

- **Controls:** Tap and move (default), or a joystick at the lower left. The joystick is set in ⚙️ → Sound, errors, display and controls.
- **Sprint:** lower-right action column, just above ⚙️.
- **Phones:** the play view is 2.5× larger (screens narrower than 600 px). Pinch and double-tap zoom are off on this page.
- **Infinite mode:** on the title screen. After tier 20 the size goal rises 25% each time; there is no 15-minute cap and no win. Score still counts.
- **End game:** ⚙️ → End game shows your score and the best score.
- **Level up:** the old fish stay. New fish swim in from the edges for six seconds and can't touch you until they've settled.

## Combat, health and chum (v0.4)

- **Bites:** a fish is removed when its health reaches zero. A bite takes off the attacker's attack value. The player bites every 0.6 s; fish bite every 0.9 s.
- **Attack:** 1 + floor(size / 8). A size-1 fish does 1; a size-100 fish does 13.
- **Health:** fish max(1, round(size / 3)). Small fish die in one bite; bigger fish take several.
- **Your health:** 10 + floor(size / 2). Regenerates 3 per second after 4 seconds without a hit. Running out costs a life, as before.
- **Danger readability:** coral dot = can hurt you, mint dot = you can eat it. Health bars can be hidden in ⚙️ → Sound, errors and display.
- **Chum:** a fish of size 4 or more leaves up to 6 pieces of chum when it dies (size / 5). Chum lasts 25 seconds. Prey fish that see chum or plankton within range go to feed, so schools form around it.
- **Active sea:** small fish and hunters with nothing to chase go after plankton and krill.

## Difficulty: the predator:prey ratio

The sea adapts to your size. Each new fish is sized against you:
- **Predator** = a non-docile hunter or ambusher at least 1.1× your size (it can eat you).
- **Prey** = a fish at most 0.87× your size (you can eat it).
- **Where they come from:** predators are drawn from 1–3 tiers above you, and prey from 0–3 tiers below (or your own tier). Size still decides who is a threat or edible. If no species fits that window, any species that fits the size is used.
- Threats spawn at 1.15–1.9× your size. Edible fish at 0.25–0.85× your size. Harmless fish are a small share.

| Setting | Ratio (predator : prey) | Share of new fish that are predators |
|---|---|---|
| Easy | 1 : 4 | 20% |
| Medium | 1 : 2 | 33% |
| Hard | 1 : 1 | 50% |

From 2:30 the predator share rises by up to 50% (capped at 70%) as the game gets harder. Pick the setting on the title screen. Measured headless: the threat share was 0.23 on easy, 0.32 on medium and 0.51 on hard, at tier 10.

## Files

- `index.html`: the page (title, HUD, sprint, ⚙️ panel, end card, error strip).
- `css/style.css`: pastel look, bold outlines, offset shadows, big targets.
- `js/species.js`: 20 tiers and their species (`SPECIES` with `tier`, `temper`), zones, `GOALS`, `DIFFICULTY`, `leadOf()`, config (lives, time limit, tension, database keys).
- `js/game.js`: simulation (player, AI, eating, lock-on, levels), drawing and input. Test hook: `window.FishGame` (`state()`, `debugSetSize()`).
- `js/notes.js`: notes. Saved to a cookie (last 25 notes), then to the family database when signed in.
- `js/family.js`: family sign-in (`FishFamily`): the shared Family project, same account as Expansion Wars.
- `js/sound.js`: Web Audio tones, created on the first touch.
- `supabase/001_fish_notes.sql` and `supabase/test_001_fish_notes_rollback.sql`: the notes table (applied to the Family project).

## Notes and database

- Every note is saved in a cookie straight away (`fish_notes`, up to 25, 300 characters each), with the level, size and seconds into the run.
- **Live** in the shared Family project (applied 2026-11-03, after its rolled-back test passed; RLS on, `anon` has no access, `authenticated` can only insert and read; registered as app `fishes`).
- Signing in: ⚙️ → Family database, with the family account (the same as Expansion Wars). The password is not stored. The session tokens stay on the device so it stays signed in until you sign out. Without a sign-in, notes stay in the cookie and the status says "needs family sign-in".
- Failures show on the page (the status line, and the error strip at the bottom when "Show errors" is on).

## Not in MVP

- Saved progress across visits (only the best score on this device).
- Sound files, music, story, Quick Game, and a high-score list.

## Open

- See `convo/convo v0.1.md`. The defaults above are built in and can be changed there.
