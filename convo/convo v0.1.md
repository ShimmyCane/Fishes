# Fishes — Convo v0.1

**Project:** Fishes
**Round:** 1 of clarifying questions (started by `/start-project`; MVP built from the defaults marked **(default)**, so you can react to it directly.)

Answer inline under each number. Leave a question blank if you don't know yet.

## What I understood

- A fish-tank game that grows into the ocean. Start as a baby fish eating plankton. Eat smaller things, grow, and become the largest fish ever.
- Fish should be inspired by real fish (researched; the species list is in `schematic.md`).
- Twenty levels. The water world scales out from shallows to deep ocean, with more enemies and more food as you go deeper.
- You can swim and sprint. Other fish can lock onto you. It gets harder after 2 to 5 minutes. The game ends between 8 and 15 minutes.
- Feedback comes through notes in the game, saved with cookies and in the database.
- "Review Expansion Wars": its notes and conventions were used as the template (plain HTML/CSS/JS, ⚙️ settings, errors at the bottom, an `app_table_registry` row, and a rolled-back SQL test before anything is applied).

## Ending and difficulty

1. Win at size 100 on level 20 (default). Is that the right finish?
2. Lives: 3, shrinking to 75% of your size on each hit, then respawn (default). Or should a hit end the run?
3. Hard cap at 15 minutes with a score (default). Otherwise, should the game run until you win or lose?
4. Difficulty ramps from 2:30 to full at 5:00 (default). Is the ramp right?

## Controls

5. Hold the finger on the sea to swim toward it (default). Or tap to set a target?
6. Sprint is a button (lower left) that uses stamina (default). Should it be double-tap instead?

## Enemies

7. Hunters lock on for about 7 to 9 seconds, then break off (default). Should a lock show more warning?
8. Pufferfish costs size if eaten (default). Should it be a different, harmless effect?
9. Fish do not eat each other in the MVP (default). Should the food chain be added next?

## Notes and database

10. Notes saved to a cookie first, then the database (default). The database table `fish_notes` is in the Family project, and only signed-in family members can write to it. Do you want family sign-in added to the page now, or should notes stay in the cookie until then?
11. Do you want to read notes in the Family project, or on a page?
12. Should the database keys be filled in once you have run the migration (you hold the publishable key)?

## Visibility (public repo)

13. This project lives in the public repo. Is that OK, including its name? (default: yes)
14. No personal details are in this project. Confirm that is right (default: yes).

---

_Answers go in `convo/convo v0.2.md` once this round is complete._
