# Fishes — Convo v0.2

**Project:** Fishes
**Round:** 2 (feedback on the MVP). v0.1 is kept as it was. Its questions 8 and 9 are answered below.

## What changed

- **Twenty tiers, several species per tier.** Each tier has 2–3 species, some docile and some aggressive. The first listed is the form the player evolves into.
- **Evolution.** The fish grows and takes the form of its tier.
- **Fish eat fish.** Bigger non-docile fish eat smaller ones they touch, and hunt them nearby. (This replaces v0.1 question 9.)
- **The sea adapts to your size.** New fish are sized against you. Threats and prey are chosen from size bands relative to the player.
- **Easy / Medium / Hard = predator:prey ratio.** Easy 1:4, Medium 1:2, Hard 1:1, chosen on the title screen. The share rises by up to 50% from 2:30. Predator means a non-docile fish that can eat you.

## Decisions I made (defaults, change them here)

1. Docile fish never attack or lock on. Wary fish hunt smaller fish but ignore you when you are smaller. Only aggressive fish lock on to you.
2. Predator size band: 1.15–1.9× your size. Prey band: 0.25–0.85×. Harmless fish are a small share.
3. Fish target: 22 + 2 × tier (non-food fish). Food is separate.
4. The evolved form is the first species listed for each tier.
5. Your end card names what ate you.

## Questions

1. Are the temperaments right? In particular, should a wary hunter ever lock on to you, or is "no lock-on" the right line?
2. Is the difficulty ratio the right measure, or should Hard also change how fast the fish are?
3. Should evolution be a choice (for example, two forms per tier), or is one form per tier fine?
4. Any species you want added, removed or moved to a different tier? (The real-fish note for each is in `js/species.js`.)
5. Should a fish eating a fish also make the eater grow, so the sea gets bigger as well as more crowded?
6. The lives rule (three hits, 25% shrink, three seconds of safety) is still a default. Want it to be harsher or gentler?

---

_Answers go in `convo/convo v0.3.md` once this round is complete._

## Answers (2026-11-03)

- **Family database (v0.1 Q10–12):** yes, Fishes may borrow the family right to add to the Family database. It uses the same family account as Expansion Wars. The `fish_notes` table is applied (after the rolled-back test). Sign-in is in ⚙️ → Family database.
- **Species:** each tier now has 3–8 species (88 in total). Predators come from 1–3 tiers above the player, and prey from 0–3 tiers below. The difficulty ratio still decides the mix.
