# Fishes — Claude Code pointer

Purpose: a game inside a fish tank that becomes the ocean. Start as a baby fish, eat, grow to the largest fish ever. Hunters lock on; it gets harder after 2:30; the game ends between 8 and 15 minutes.

- Design: `schematic.md`
- Q&A history: `convo/` (never compact; start a new version instead)
- AI notes: `04 AI/` (`brief.md`, `lessons.md`). Read `lessons.md` before a change.
- Project skills: `.claude/skills/` (`fishes-change-workflow`, `fishes-playtest`, `fishes-sea-creatures`)
- Playtest: `node tools/playtest.js` (layout, ally rules, smoke run; runs headless against this folder)
- Database SQL: `supabase/` (apply by hand after the rolled-back test)
- Shared conventions: root `CLAUDE.md` (public repo, privacy rules)

How to run: open `index.html` in a browser (no build step, no server). For the cookie notes to work, serve the folder (for example `python3 -m http.server`) rather than opening the file directly. Settings and notes are behind ⚙️ in the lower right.
