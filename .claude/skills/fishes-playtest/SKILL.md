---
name: fishes-playtest
description: Verify a Fishes change by running the real game headless. Use after any change to js/game.js, css/style.css or index.html, before reporting it done, and whenever asked to check layout, the ally or sprint buttons, joystick sizing, balance, or whether a run crashes.
---

# Fishes playtest

The game has no build step and no unit tests. The checks live in `tools/playtest.js`, which serves this folder itself and drives headless Chromium through Playwright.

## Run

```bash
node tools/playtest.js            # every check (about 1 minute)
node tools/playtest.js layout     # button and joystick overlap, six screen sizes
node tools/playtest.js allies     # ally price rules and ally death
node tools/playtest.js smoke 60   # play 60 seconds, report page errors
```

Exit code 1 means a check failed. Quote the failing line in your report.

Setup is already in place here: Playwright is global (`npm root -g`), and Chromium is at `/opt/pw-browsers/chromium`. Do not run `playwright install`.

## Test hook

`window.FishGame` (defined near the end of `js/game.js`):

- `state()`: mode, level, size, npcs, allies, allyCost, census, spread, hunters, player position, and more.
- `debugSetSize(n)`: sets the player's size and runs the level check. Use this to reach a level quickly.
- `debugKillAllies()`: kills every living ally, to test the price fall-back.

Rules for using the hook:

- Read `state()` after a short wait, not in the same tick as a click. A click's effect lands a frame later.
- Predators can kill a new ally within a second, so test ally rules as invariants (price = living allies + 1), not as fixed sequences.
- Don't add test hooks that change gameplay. Read-only hooks and explicit `debug*` kill or set functions are fine.

## Adding a check

Add a function to `tools/playtest.js` that calls `check(name, ok, detail)`, then add it to the `main` dispatch. A check should fail for the reason the user cares about, and print the numbers that explain it.

## What headless can't tell you

- Touch feel and iPad sizing. Say so in the report, and ask for a device check.
- Whether a fish looks right. Use a screenshot only when the user asks for visual review.
- Balance. Headless runs show crashes and rule violations, not whether a level feels fair. Ask for a timed run on a device.
