---
name: upstream-release
description: "Check a new upstream OpenMausBot release tag against this fork, report what breaks and what's new, then sync bb-1 and the fork on a go. Use when Akbar says check upstream, asks about a new upstream tag or release, or mentions a new milind-soni/OpenMausBot version."
---

# Upstream release

This fork merges upstream release tags, never upstream `main`, so the
Personal UI matches the server version bb-1 runs. Syncing a tag means two
things: bb-1 installs it, then the fork merges it. The check part only
reports. The sync part runs only on Akbar's go.

## Check

Change nothing in this part: no merge, no checkout, no service restart.

1. Run `git fetch upstream --tags`.
2. Set `OLD=$(git describe --tags --abbrev=0 main)` and
   `NEW=$(git tag --sort=-creatordate | head -1)`. If they match, report
   "up to date" and stop.
3. Read bb-1's version (read the `device-fleet` skill first):
   `ssh bb-1 'grep "\"version\"" ~/Documents/OpenMausBot/app/lib/node_modules/openmausbot/package.json'`.
4. Read the release notes of every tag after `OLD`:
   `gh release view <tag> -R milind-soni/OpenMausBot --json body -q .body`.
5. Dry-run the merge: `git merge-tree --write-tree --name-only main $NEW`.
   The first line is the result tree; the `CONFLICT` lines name the files.
   Count hunks per file with
   `git cat-file -p <tree>:<file> | grep -c '^<<<<<<<'`.
6. Find the risks a clean merge can hide:
   - files changed on both sides: `comm -12` of
     `git diff --name-only $OLD main` and `git diff --name-only $OLD $NEW`;
   - exports removed from `shared/` and `src/lib/` between the tags, then
     `git grep` the result tree for any the fork still uses outside
     conflict hunks;
   - `package.json`, `pnpm-lock.yaml`, `electron/` and `shared/` wire changes.
7. Sort the commits into features, contract changes and touched UI areas.
   Under 100 non-merge commits (`git rev-list --count --no-merges $OLD..$NEW`),
   or when the release notes already explain each change, do it inline
   from the notes and `git log --first-parent`. Above that, send the sorting
   to a Haiku subagent and verify any claim you report as a risk with git.
8. Read [`docs/personal-bot-panel.md`](../../../docs/personal-bot-panel.md),
   its file table and its "Merging an upstream release" section, then sort
   each conflict hunk:
   - **Mechanical:** the doc already decides it (the fork's tiles, one page
     with no tabs, no `DetailsTab`), or it is imports, locale keys or tests.
     The sync part resolves these by keeping both sides in the fork's layout.
   - **Layout:** upstream adds UI the doc does not place, such as a new row
     whose card is a real choice. Each one becomes a question for Akbar.

### Report

Keep it brief, in this order:

1. **Versions:** `main` on `OLD`, upstream `NEW` with its date and commit
   count, bb-1's version.
2. **Will it break:** the conflict table (area, files, hunks), the
   modify/delete conflicts, and the clean-merge risks from step 6.
3. **New features:** the user-visible ones, one line each.
4. **Sync proposals**, in Akbar's proposal layout: update bb-1 to `NEW`, then
   merge `NEW` on `chore/upstream-<NEW>`.
5. **Layout questions** from step 8, one Q each with a recommended pick.

Stop there and wait for the go.

## Sync

A go on the check report covers every step below, including the layout
answers. Stop only at step 6, for Akbar's OK.

1. **Check bb-1 is idle.** Run `ssh bb-1 'systemctl --user status openmausbot --no-pager'`.
   A `claude` or `codex` child process means a bot is mid-turn. Wait and
   check again; after two busy checks, ask Akbar.
2. **Update bb-1** (no data backup; Akbar chose that):

   ```sh
   ssh bb-1 'bash -lc "source ~/.nvm/nvm.sh; systemctl --user stop openmausbot \
     && npm install --global --prefix ~/Documents/OpenMausBot/app openmausbot@<version> \
     && systemctl --user start openmausbot"'
   ```

   Then confirm the version from Check step 3, `systemctl --user is-active openmausbot`,
   and `curl -s http://127.0.0.1:8799/api/health` on bb-1 answering
   `{"app":"openmausbot"}`. If the start fails, read
   `journalctl --user -u openmausbot -n 50` and report it.
3. **Merge on a branch.** From `main`, run `git switch -c chore/upstream-<NEW>`
   and `git merge --no-ff <NEW>`. Follow the doc's "Merging an upstream
   release" section, and apply the layout answers. Record each answer in the
   doc's file table in the same merge.
4. **Commit** the merge as `chore: the fork runs upstream <NEW>`, with a body
   that names each layout choice and each non-obvious resolution.
5. **Verify:** run the doc's test list and `i18n:check`, plus the tests named
   after any other conflicted file, then `corepack pnpm typecheck` and
   `corepack pnpm lint`.
6. **Show it:** run `corepack pnpm dev:personal` and wait for Akbar's OK on
   the changed screens.
7. **Land it:** fast-forward `main` to the branch, run `git push origin main`, run
   `corepack pnpm package:personal --install`, and confirm the running
   Personal window shows the change.
