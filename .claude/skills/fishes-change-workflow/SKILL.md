---
name: fishes-change-workflow
description: How to make, test, record and ship a change to the Fishes game. Use at the start of any Fishes task that edits files, and when opening, updating or merging a PR for this repo.
---

# Fishes change workflow

## 1. Start from current main

Always fetch first. A checkout of `origin/main` without a fetch can be weeks stale and silently drop merged work.

```bash
git fetch origin && git checkout -B claude/<short-name> origin/main
git status    # must be clean before you start
```

If the working tree has changes you didn't make, stop and ask before touching them.

## 2. Make the change

- Read the code you change. `js/game.js` is one large closure; helper functions are scoped inside it, and `window.FishGame` is outside that scope. Don't call inner helpers from the hook. Compute the value inline there.
- Put numbers that a player might tune in one named constant near the feature (for example `LEASH`, `ALLY_SHARE`), and say what they mean in a comment.
- In CSS, a child's `em` resolves against its own font size. If you need one scale for a group, set the font size on the container and size children against it.
- Keep the change to what was asked. Note any tuning you guessed at, so the user can redirect.

## 3. Test

```bash
node --check js/game.js
node tools/playtest.js            # see the fishes-playtest skill
```

Add a check for each new rule you add. If a check is flaky, make it test an invariant rather than a sequence.

## 4. Record

- Add a `CHANGELOG.md` entry for every user-visible change, under a new heading `## 0.10 — unreleased` until a release. Describe what the player sees, in their words. The version number in `js/species.js` (`VERSION`) changes only at release, and only when the user asks.
- Add a line to `04 AI/lessons.md` if you hit a surprise a future session would hit too.
- Change the build stamp on every merge: `BUILD` in `js/species.js` and every `?b=` in `index.html`, to the same value (for example `2026-11-08.2`). Browsers, iPad Safari above all, keep old cached scripts otherwise, and the version label alone cannot tell builds apart. The playtest checks that they match.

## 5. Commit

- Commit message: a short imperative subject, a body that says why, and these two trailers, verbatim:

```
Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013zgJjjaUh2eJxegbxC44vA
```

- Push with `git push -u origin <branch>`, retrying network errors with backoff.

## 6. PR

- Open a **draft** PR against `main`. Use `.github/pull_request_template.md` if one exists (none did at last check).
- The PR body lists what changed, what was tested (with numbers), and what was not tested (for example "not tried on iPad").
- Subscribe to the PR's activity right after creating it.
- End the PR description with the attribution line from the session instructions.

## 7. Merge

Merge only when the user says "Merge" for that PR. Then:

1. Fetch the PR head SHA and confirm it matches what you tested.
2. Mark the PR ready for review (GitHub won't merge a draft).
3. Merge with `expectedHeadSha` set to that SHA, using the merge method the repo already uses (merge commits, titled `… (#N)`).
4. Unsubscribe from the PR, and report the merge commit SHA.

Never force-push, rebase a shared branch, or merge from a stale copy.
