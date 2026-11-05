---
name: fishes-sea-creatures
description: Design and build guidance for the next Fishes milestone: richer graphics, species that look and act distinct, other ocean elements, and smarter sea creatures. Use when planning or implementing creature visuals, species behaviour, new ocean features, or AI changes in js/game.js or js/species.js.
---

# Fishes sea creatures and ocean (next milestone)

The user wants this milestone to push four things. Treat them as one system, not four features: each creature should be recognisable at a glance, behave in a way that matches how it looks, and live in an ocean that has things besides fish.

## Where things are now

- `js/species.js`: `SPECIES` (88 entries) with `tier`, `temper` (docile / wary / aggressive), `kind` (food, prey, hunter, ambush, harmless), `shape`, `col`, `size`, `speed`, `spiky`. `ZONES` sets the palette per depth.
- `js/game.js` `drawEntity` draws every fish from its `shape` and colour. The player's `desc` uses the same shape code.
- AI lives in `updateNPC` (general fish), `updatePodMember` (your school and allies), and `pickSpecies` / `fillPopulations` (who spawns where). Predation: a non-docile fish at least 1.25× bigger bites a smaller fish it touches.
- The sea is a 420×260 world per tier, with plankton, chum and small fish as the food web.

## Principles to keep

1. **Read the data, not the picture.** Any behaviour a player can see should come from the species fields (temper, kind, speed, shape), so a new species needs data, not new code.
2. **Differentiate by three things a player can read at once:** silhouette (shape), colour pattern, and motion (speed, fin rhythm, how it turns). Don't rely on colour alone; some players can't tell colours apart.
3. **Threat is always readable.** Coral means can hurt you, mint means you can eat it (already in the HUD). Any new creature needs a clear version of that signal, and a test that it is consistent with `canHurt` and `isEdible`.
4. **Cost budget first.** The game already runs about 100 NPCs. Before adding visuals or AI, measure frame time in the headless run (`performance.now()` around the draw loop) and keep new work under a fixed budget per frame. Cheap shapes and cached gradients beat per-frame path building.
5. **Smarter means simpler rules that read well.** Prefer a few legible behaviours (flee when threatened, school when calm, ambush near cover, follow chum) over a complex planner nobody can see working. Each behaviour should be visible in play and testable with `state()`.
6. **Keep the balance rules.** Predator sizes, the ratio difficulty, and the 9-meal level length are tuned. A new creature must respect them, and any change to them needs a timed run.

## Ocean elements to consider

Good candidates, in order of how much they add for the cost: kelp or seagrass that hides small fish and blocks hunters' lock-on; currents that push fish and the player; bubbles or light shafts for depth; a seabed with burrowing or resting species; jellyfish that drift and sting on contact.

## How to work on it

- Plan in small slices, one per PR, each playable on its own. Start with one new element and one visual upgrade, not all four at once.
- For each slice: add the data or code, add a `playtest.js` check that the new rule holds (for example, a camouflaged fish is not locked on), and screenshot it at two sizes if the user asked for visual review.
- Record decisions in `04 AI/brief.md`, and open questions for the user in `todo.md`. Don't guess at art direction; offer two options with a sentence each.
