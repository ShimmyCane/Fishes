# Fishes — Changelog

Every version the team can open, newest first. The version shows on the title screen and at the top of ⚙️ Settings. If you see a different version there than below, you are looking at an older copy.

## 0.11 — unreleased
- Settings → Notes for Jimmy now lists the family notes with a status you can change: ◌ start anew, 🟡 testing, ✅ done. Sign in to see them. The family table has a status column for this; the family account can change only the status, not the note text.
- Allies stay with you when you level up or evolve. Every fish now keeps its height relative to you, as it kept its distance sideways, so nothing is left behind in the new sea.
- Your speed grows 3% a level, like the fish's, so the fish does not seem to slow down as the camera zooms out.
- Bigger fish swim faster and are less nimble on turns.
- Small fish that die in one bite no longer show a health bar.
- The whole world is drawn 25% smaller, so the fish is less large on screen. You see a little more of the sea.
- On tablets (screens at least 700 px wide and 600 px tall), the Ally, Attack and Sprint buttons are about twice as wide, so they are easier to hit on an iPad.
- The mini map is in the top right. On short landscape screens it stays top left, beside the top bar, so the buttons keep clear of it.

## 0.10 — 2026-11-07
- Pacing: levels 1 to 5 need three times the growth they did (level 1 ends at size 12, not 6), so there is more food to find before you move on. Later levels need 13% less, and the largest fish is still about 300. Each meal gives the same growth as before.
- Your allies heal after four seconds without a hit (a third of their health a second), and eating food heals them a little.
- New Attack button, between Ally and Sprint: for 8 seconds your allies go for the fish you last bit (or the nearest fish near you), and they stop running from bigger fish. Ready again after 20 seconds.
- Allies are marked with a dashed teal ring. The school that joins you from level 10 has no ring, so the count of allies is the ones you bought.
- Buying an ally can't take you below the start of your current level. The EXP you spend comes from the growth of this level.
- Small fish eat the plankton and chum they touch. Plankton scatters from any fish that swims close.
- Hunters look further on deeper levels.
- Fixed: the first level's goal showed 2 until you levelled up.
- New creatures, none of them hunt you:
  - Green sea turtles and rock crabs in the shallows. Crabs walk sideways along the seabed.
  - Moon jellyfish from level 3. They drift, and touching one stings you for a little health (every 1.5 s). You cannot eat them, so swim round them.
  - Gulls glide over the surface. They show when you are near the top of the sea.
- More life in the sea: about twice as many sea anemones and kelp patches, spread across the whole sea (more of each at every level). Anemones are safe spots, so there are more places to hide too.
- Any fish can fight any fish. Two fish that touch fight whatever their size: each bites for its attack value, and the one whose health runs out first is removed. You can now bite bigger fish, and they bite back. Food and harmless fish never bite, and fish of one species don't fight each other.
- Allies run from anything that out-fights them (attack times health) and go for anything they can beat, rather than using a fixed size rule.
- Denser sea (on by default, Settings → Sound, errors, display and controls): the bigger sea has four times the fish, so it is as dense as before it grew. Turn it off for the sparser sea (and a little less work for the phone).
- The sea is twice as big to start, and grows 16% a level. The camera zooms out gradually from level 1 to 20, so a fish looks 25% bigger on screen by level 20, and the sea shows more of itself as you grow.
- The seabed has hills, and the surface has waves. Both repeat exactly at the edge of the sea, so the left and right sides meet without a seam.
- Swim up through the surface and you hop out into the sky, higher the bigger you are. You splash back down when you land.
- A current runs sideways in bands by depth, so neighbouring layers of sea drift in opposite directions. It pushes fish, and you a little.
- Kelp patches on the seabed: plankton and small fish gather round them. Ambush fish swim a loop round a patch and lunge at what gathers there.
- The sea has no walls. Swim off the left edge and you come out on the right (and the other way round). Fish keep their places around you when you level up.
- Mini map in the top left: the whole sea, your position (white), big predators that can hurt you (red), sea anemones (pink) and the part of the sea the screen shows (box).
- Sea anemones are safe spots, spread around the sea. Hide under one and nothing hunts you there, so you don't have to keep running.
- The whole world is drawn 4× larger. Fish, plankton, the joystick and the bite ring all scale together, so you see less of the sea at once and the camera follows you.
- You start at size 3 (was 1). Every level's size goal is three times what it was, so the climb keeps its shape: level 1 ends at size 6, level 2 at 9, and so on up to 300 at level 20.
- Joystick (lower left, when Controls is set to Joystick): sized to the screen, about 28% of the shorter side, with the knob and its reach scaled to match. Easier to use on iPad.
- Ally, Sprint and ⚙️ are one column in the lower right. They scale with the screen and no longer overlap.
- Allies: the price is one more than the number of living allies, so it falls when they die. Allies forage chum and plankton, run from anything that could eat them, and stay within reach of you. Each ally meal adds half the EXP you would get from the same meal.

## 0.9 — 2026-11-04 (feedback round 7)
- Level 20 takes ten fish meals (levels 1–19 keep nine).
- Endless after level 20: no win and no time cap. The goal keeps rising 25% each step, and the score (shown in the top bar) keeps going up. Infinite mode is always on, so its title-screen toggle is gone.
- Ally button (above Sprint): one EXP (size) makes an allied fish. Each allied fish after the first costs one more EXP (1, 2, 3, …). Allies are school fish: they bite smaller fish and run from predators four times their size. Allies bought this way do not come back after they are eaten.
- Hunters come in packs of 2 to 3 (most of the time). When one locks on, its pack-mates lock on too.
- From level 10, fish have twice the hit points again, so bigger prey takes several bites to bring down.

## 0.8 — 2026-11-04 (feedback round 6, from the family's 06:41–06:42 notes)
- Hit points doubled, for fish and for you.
- Bite timer: at least one second for you (was 0.6 s). Eating chum or plankton also starts the timer.
- Your school no longer comes back after its members are eaten. New members come only from a new level, or from feeding chum near the school (up to 12 in all).
- The school takes on your species when you evolve.
- The school runs from a predator four times its size, and only attacks fish up to 0.6× its size (was 0.85×), so it is less overpowering.
- The sea grows 10% per level (was a fixed step).
- Not yet built: EXP per level doubling, the skill button, and hunting in groups (see convo v0.7 questions).

## 0.7 — 2026-11-04 (feedback round 5)
- Growth: each level takes about nine fish meals at most. Each meal gives at least a ninth of the level's size range (the 1/10 slowdown is gone). Plankton and chum keep their rate.
- Your school (from level 10): a pod of your own species follows you, bites smaller fish, and grows with you. There are 2 at level 10, up to 12 by level 20.
- Feeding chum near the pod gives a 50% chance of a new member (up to 12).

## 0.6 — 2026-11-04 (feedback round 4)
- Level up keeps the fish around you. Background colours fade to the new zone over two seconds. No new species swap in next to you; new species appear far away, gradually.
- Growth from fish meals is 1/10 as fast from level 2 on. Level 1 keeps its pace, with more plankton to find.
- Hit points: fish of size 4 or more take 2 to 5 bites. Smaller fish take one or two.
- Schools defend: a bitten school fish calls its schoolmates, who bite back at the attacker (you included).
- Predators 2.5× a fish's size make it scatter from further away, and faster.
- Predators notice chum and gather at it.
- A larger fish breaks into chum bits (about a quarter of its size) when it dies, instead of vanishing.
- Plankton and chum bits are eaten on contact again.

## 0.5 — 2026-11-04 (feedback round 3, part 2)
- Phones: the play view is 2.5× larger, so fish are bigger on iPhone. Pinch and double-tap zoom are turned off on this page.
- Controls: Tap and move (default) or a joystick at the lower left. Choose in ⚙️ → Sound, errors, display and controls.
- Sprint is now in the lower-right action column, just above ⚙️.
- Bite timer: a ring round you fills up as your next bite comes ready.
- Blood and violence: bites splash red. Once a fish is hurt, other fish go for it first.
- Swimming looks livelier: stronger tail wiggle and a flapping fin.
- Fish gain 25% of prey size per meal (was 40%), so levels take longer.
- Bigger levels: the world grows faster, fish speed up with each tier, and the sea holds more fish.
- Level up: the old fish stay, and new fish swim in from the edges for about six seconds. They can't touch you until they've settled.
- ⚙️ End game shows your score and the best score.
- Infinite mode (title screen): after tier 20 the goal rises 25% each time, with no time cap and no win.

## 0.4 — 2026-11-03 (PR #96, merged)
- Combat: fish have health. Small fish go in one bite; bigger fish take several bites with a pause between them. Attack is 1 + size/8, health is size/3 (at least 1). You have a health bar too; losing it costs a life. Health regenerates after 4 seconds without a hit.
- Health bars on fish and on you, hidden from ⚙️ → Sound, errors and display.
- Danger at a glance: a coral dot over fish that can hurt you, a mint dot over fish you can eat.
- Chum: a fish of size 4 or more leaves chum when it dies. Chum lasts 25 seconds and draws nearby small fish in to feed, so schools form.
- A busier sea: small fish and hunters go after plankton and krill when nothing else is happening.
- Fish eat fish with bites, not instantly.
- Notes are no longer sent twice when signing in (one send at a time).

## 0.3 — 2026-11-03 (PR #95, merged)
- Family sign-in is in ⚙️ only; removed from the front page.
- Settings sections (sound and errors, family database, notes) start collapsed; tap to open.
- Notes go to the cloud database: each note is kept on the device with an unsent flag, sent when you save while signed in, and sent automatically when you sign in. ⚙️ and the title screen show how many notes are still only on the device.

## 0.2 — 2026-11-03 (PR #90, merged)
- 20 tiers, now 88 species (3–8 per tier, food included). Each tier mixes docile, wary and aggressive fish.
- The player evolves into its tier's lead species.
- Fish eat fish: a non-docile fish ≥1.25× bigger eats a smaller fish it touches.
- The sea adapts: predators come from 1–3 tiers above the player, prey from 0–3 tiers below.
- Difficulty on the title screen is the predator:prey ratio: Easy 1:4, Medium 1:2, Hard 1:1.
- Family database: `fish_notes` applied to the Family project. Family sign-in in ⚙️ → Family database, also reachable from the title screen. Notes save to the cookie first, then to the family table.

## 0.1 — 2026-11-03 (PR #88, merged)
- First playable MVP: 20 levels, one species per level, lock-on hunters, three lives, 15-minute cap.
- Notes saved to a cookie. Database SQL written but not applied.
