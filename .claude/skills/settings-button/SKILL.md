---
name: settings-button
description: How the Fishes ⚙️ Settings panel is built: the toggles, the version label, the feedback notes box, the family sign-in and the note status list (start anew, testing, done). Use when changing the Settings panel, adding a setting or toggle, changing how notes are shown or saved, or changing the family database's note status.
---

# Settings button

The ⚙️ button opens the settings panel (`#panel` in `index.html`). The game pauses while it is open.

## What is in it

- **Version:** the label at the top reads `CFG.VERSION` and `CFG.VERSION_DATE` from `js/species.js`. Change those only at release (see `fishes-change-workflow`).
- **Toggles** (a `<button class="toggle" aria-pressed>` on each row). Each one:
  1. has a row in the markup, with an id like `hp-toggle`,
  2. is set in `openPanel()` in `js/game.js` (`aria-pressed` and the text On/Off),
  3. has a click handler that saves to `localStorage` (a key like `fish_healthbars`) and updates the text.
  Current toggles: Sound, Show errors, Health bars, Denser sea, Controls.
- **Notes for Jimmy** (a `<details class="fold note-box">`): the note text box, the device list, the database line, and the **status list** (`#status-list`).
- **Family sign-in** (`#family-email`, `#family-pass`, `#family-in`, `#family-out`): the account that can read and change family notes. The password is never stored.

## Note statuses

- Statuses are `start` (◌ dashed circle, start anew), `testing` (🟡 yellow) and `done` (✅ green). The button cycles start → testing → done → start.
- The database column is `status` (migration `supabase/002_fish_notes_status.sql`). The family account has `update` on that column only, not on the note text.
- The list loads only when signed in (`refreshStatusBoard` in `js/game.js`). It reads and writes through `FishNotes.remoteList` and `FishNotes.remoteSetStatus` in `js/notes.js`.
- To set statuses for many notes, use an `update ... where id in (...)` in the Family project, after asking the user.

## Adding a toggle

1. Add the row to `index.html` in the `fold` for the group (Sound, errors, display and controls).
2. Read it in `openPanel()` and set the text.
3. Add the click handler next to the others.
4. Add a check to `tools/playtest.js` (for example, that opening ⚙️ shows the row) and run `node tools/playtest.js all`.

## Checks

- `node tools/playtest.js settings`: the notes status list shows its sign-in message when signed out.
- The status cycle and the database write need a signed-in device test. The sandbox cannot reach `supabase.co` from the browser (see `04 AI/lessons.md`), so say so in the PR.
