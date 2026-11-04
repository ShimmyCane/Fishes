# Fishes — Convo v0.3

**Project:** Fishes
**Round:** 3 (feedback from the first family play session). v0.2 is kept as it was.

## What was asked, and what was built (v0.4)

1. Other fish should swim around and chase food so the sea is busy. **Built:** small fish and hunters go after plankton and krill when nothing else is happening; chum draws small fish in.
2. Each fish has a health bar that can be hidden. Small fish go in one bite, bigger fish take more, with a pause between bites. **Built:** health bars on fish and on you, hidden in ⚙️. Bites with pauses.
3. When a larger fish dies, its body becomes chum, and small fish can team up to eat it. **Built:** chum from fish of size 4 or more; schools form around it.
4. Attack, defence, hit points and attack rate: the player asked for a sensible choice and an explanation. **Built as follows:** attack 1 + size/8; fish health size/3; player health 10 + size/2; bite pause 0.6 s for you and 0.9 s for fish. Explained in `schematic.md`.
5. Danger was hard to read. **Built:** coral dot = can hurt you, mint dot = you can eat it.

## Questions for Jimmy

1. Are the numbers right? Small fish go in one bite up to size 3. Would you like bigger fish to take longer, or go faster?
2. Your health regenerates after 4 seconds without a hit. Is that too forgiving or too harsh?
3. Chum lasts 25 seconds. Should it last longer, or fade faster?
4. Should the health bar show by default, or stay hidden until a fish is hurt?

---

_Answers go in `convo/convo v0.4.md` once this round is complete._
