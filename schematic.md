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

Twenty tiers (one per level), in five depth zones. The play area starts at 3198 × 2000. Its width grows with each tier as the camera needs (about 40,264 at tier 20); its height stays 2000 on every tier (v0.12), and the camera zooms out instead. On screen, a fish grows 25% from tier 1 to tier 20, interpolated by tier; the camera zooms out to hold that, and never shows more than 90% of the sea's width. A big fish is drawn shorter than before (its length grows with the square root of its size past 20), so the largest fish fits the fixed height.

- **Evolution (v0.12):** each tier has its first species plus five forms with a build (biter, swift, tough, striker, guard, cruiser) that sets bite, speed and health. On reaching a tier you become one of them, picked at random and weighted by how you played: biting leans to bite builds, swimming to fast ones, time with allies near you to tough ones. The style is a running mix (half this level, half before). Your path is shown at the end of a run. Tier 1 starts as a guppy. The table below is generated from `js/species.js`.
- **3–8 species per tier** (88 in total, food included), each with a temper:
  - **docile** never attacks and never locks on. It flees bigger fish. (Guppy, herring, angelfish, sunfish.)
  - **wary** hunts smaller fish, ignores you when you are smaller, and flees when you are bigger. It does not lock on. (Dottyback, cleaner wrasse, sailfish, goblin shark.)
  - **aggressive** hunts smaller fish and locks on to you when you are smaller. (Bonito, barracuda, bluefin tuna, reef shark, great white, blue marlin.)
- **Any fish can fight any fish (v0.10).** Two fish that touch fight, whatever their size. Each bites on its own timer for its attack value, and the one whose health runs out first is removed. Food and harmless fish never bite. Fish of the same species do not fight each other. The player still eats plankton, chum and smaller fish by the 1.15× rule; the lock-on and the hunters' chase still use size.

| Tier | Zone | Size to leave | Species (temper) | Forms you can evolve into (build) |
|---|---|---|---|---|
| 1 Sunny Cove | Sunny Shallows | 12 | Guppy (docile) · Neon tetra (docile) · Zebrafish (docile) · Plankton (food) · Green sea turtle (harmless) · Rock crab (harmless) | Betta (biter) · Pearl danio (swift) · Platy (tough) · Swordtail (striker) · Black molly (cruiser) |
| 2 Sea-grass Flats | Sunny Shallows | 21 | Clownfish (docile) · Goby (docile) · Blenny (docile) · Dottyback (wary) · Krill (food) | Pinfish (biter) · Silverside (swift) · Mudskipper (tough) · Sand smelt (striker) · Killifish (cruiser) |
| 3 Rock Pool Edge | Sunny Shallows | 30 | Cleaner wrasse (wary) · Herring (docile) · Sardine (docile) · Hawkfish (wary) · Moon jellyfish (harmless) | Sculpin (biter) · Rock gunnel (swift) · Rock goby (tough) · Corkwing wrasse (guard) · Shanny (cruiser) |
| 4 Sandy Shelf | Sunny Shallows | 39 | Anchovy (docile) · Pufferfish (docile) · Butterflyfish (docile) · Sergeant major (docile) · Cardinalfish (docile) | Lesser weever (biter) · Dragonet (swift) · Flounder (tough) · Red mullet (striker) · Sand perch (guard) |
| 5 Coral Gardens | Coral Reef | 57 | Parrotfish (docile) · Blue damselfish (wary) · Moray eel (aggressive) · Scorpionfish (wary) · Sea chub (docile) | Hogfish (biter) · Yellow goatfish (swift) · Squirrelfish (tough) · Soldierfish (guard) · Bannerfish (cruiser) |
| 6 Anemone Bay | Coral Reef | 62 | Angelfish (docile) · Blue tang (docile) · Lionfish (wary) · Trumpetfish (wary) · Porcupinefish (docile) | Surgeonfish (biter) · Moorish idol (swift) · Batfish (tough) · Filefish (striker) · Rabbitfish (cruiser) |
| 7 Reef Wall | Coral Reef | 67 | Mackerel (wary) · Triggerfish (docile) · Bonito (aggressive) · Sweetlips (docile) · Snook (wary) | Coral trout (biter) · Yellowtail snapper (swift) · Spangled emperor (tough) · Bluefin trevally (striker) · Black grouper (guard) |
| 8 Parrot Lagoon | Coral Reef | 75 | Grey mullet (docile) · Rockfish (docile) · Red snapper (wary) · Bluefish (aggressive) · Grouper (wary) | Queen triggerfish (biter) · Ladyfish (swift) · Napoleon wrasse (tough) · Spanish mackerel (striker) · Tarpon (cruiser) |
| 9 Open Blue | Open Blue | 83 | Jack (wary) · Pompano (docile) · Amberjack (wary) · Trevally (wary) · Barracuda (aggressive) | Yellowtail amberjack (biter) · Skipjack tuna (swift) · Cubera snapper (tough) · Atlantic bonito (striker) · Little tunny (cruiser) |
| 10 Tuna Run | Open Blue | 94 | Mahi-mahi (wary) · Bonefish (docile) · Yellowfin tuna (wary) · Bluefin tuna (aggressive) | King mackerel (biter) · Albacore (swift) · Giant grouper (tough) · Narrow-barred mackerel (striker) · Longtail tuna (cruiser) |
| 11 Shark Lane | Open Blue | 104 | Rainbow runner (docile) · Cobia (docile) · Dogtooth tuna (wary) · Sailfish (wary) · Reef shark (aggressive) | Blacktip reef shark (biter) · Spinner shark (swift) · Nurse shark (tough) · Lemon shark (guard) · Bonnethead (cruiser) |
| 12 Wide Water | Open Blue | 117 | Sea bream (docile) · Permit (docile) · Wahoo (aggressive) · Striped marlin (wary) | Atlantic wolffish (biter) · Shortbill spearfish (swift) · Wreckfish (tough) · Blue shark (striker) · Giant trevally (guard) |
| 13 Twilight Shoal | Twilight | 133 | Lanternfish (docile) · Hatchetfish (wary) · Lookdown (docile) · Opah (docile) · Snake mackerel (wary) | Black dragonfish (biter) · Pearlside (swift) · Barreleye (tough) · Snipe eel (striker) · Bristlemouth (cruiser) |
| 14 Lantern Drift | Twilight | 151 | Escolar (wary) · Ocean sunfish (harmless) · Anglerfish (aggressive) · Lancetfish (wary) | Daggertooth (biter) · Telescopefish (swift) · Black swallower (tough) · Fangtooth (guard) · Pelican eel (cruiser) |
| 15 Angler Shelf | Twilight | 169 | Pomfret (docile) · Sablefish (docile) · Thresher shark (wary) · Swordfish (aggressive) | Stargazer (biter) · Ghost shark (swift) · Monkfish (tough) · Sea toad (guard) · Coffinfish (cruiser) |
| 16 Slope Edge | Twilight | 190 | Oilfish (docile) · Cusk eel (docile) · Hammerhead (wary) · Gulper eel (aggressive) | Lingcod (biter) · Grenadier (swift) · Orange roughy (tough) · Pacific halibut (guard) · Hagfish (cruiser) |
| 17 Deep Trench | Deep Trench | 214 | Viperfish (wary) · Tripodfish (docile) · Coelacanth (harmless) · Oarfish (harmless) · Frilled shark (wary) | Black seadevil (biter) · Rattail (swift) · Snailfish (tough) · Deep-sea cod (guard) · Smooth dreamer (cruiser) |
| 18 Oar Valley | Deep Trench | 240 | Goblin shark (wary) · Megamouth shark (harmless) · Sixgill shark (wary) · Great white (aggressive) | Broadnose sevengill (biter) · Ribbonfish (swift) · Pacific sleeper shark (tough) · Atlantic bluefin (striker) · Giant sea bass (guard) |
| 19 Abyss Mouth | Deep Trench | 268 | Greenland shark (wary) · Blue marlin (aggressive) · Sand tiger shark (docile) | Tiger shark (biter) · Shortfin mako (swift) · Giant manta ray (tough) · Oceanic whitetip (striker) · Bull shark (guard) |
| 20 Whale Ocean | Deep Trench | 300 | Basking shark (harmless) · Whale shark (harmless) · Giant sunfish (harmless) | Great hammerhead (biter) · Black marlin (swift) · Beluga sturgeon (tough) · Longfin mako (striker) · Goliath grouper (guard) |

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

- **Bites:** a fish is removed when its health reaches zero. A bite takes off the attacker's attack value. The player bites every 0.6 s; fish bite every 0.9 s. (v0.10: the player's bite pause is 1.0 s, and fish bite each other every 0.9 s.)
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
