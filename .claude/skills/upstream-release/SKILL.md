---
name: upstream-release
description: "Check a new upstream OpenMausBot release tag against this fork, report what breaks and what's new, then merge it and install the fork's server package on bb-1 on a go. Use when Akbar says check upstream, asks about a new upstream tag or release, or mentions a new milind-soni/OpenMausBot version."
---

# Upstream release

This fork merges upstream release tags, never upstream `main`. bb-1 runs
this fork's own server package, built on mb-0, so syncing a tag means: the
fork merges it, then bb-1 installs the package built from that merge. Nothing
updates by itself. The check part only reports. The sync part runs only on
Akbar's go.

## Check

Change nothing in this part: no merge, no checkout, no service restart.

1. Run `git fetch upstream --tags`.
2. Set `OLD=$(git describe --tags --abbrev=0 main)` and
   `NEW=$(git tag --sort=-creatordate | head -1)`. If they match, report
   "up to date" and stop.
3. Read bb-1's version (read the `device-fleet` skill first):
   `ssh bb-1 'grep -E "\"(version|personalCommit)\"" ~/Documents/OpenMausBot/app/lib/node_modules/openmausbot/package.json'`.
   `personalCommit` is the fork commit the package was built from. A package
   without it is an official one.
4. Read the release notes of every tag after `OLD`:
   `gh release view <tag> -R milind-soni/OpenMausBot --json body -q .body`.
5. Dry-run the merge: `git merge-tree --write-tree --name-only main $NEW`.
   The first line is the result tree; the `CONFLICT` lines name the files.
   Count hunks per file with
   `git cat-file -p <tree>:<file> | grep -c '^<<<<<<<'`.
6. Audit every fork commit, not only the conflicts. A clean merge can still
   undo a fork change.
   - List the fork's commits:
     `git log --no-merges --format='%h %s' main --not --remotes=upstream --tags`.
     Mark each one whose files upstream also changed between `OLD` and `NEW`.
   - For each marked commit, judge from the result tree whether its purpose
     still holds. Read upstream's deleted lines in its files: a fork change
     can rely on an upstream line that upstream now deletes, with no conflict.
   - In each conflict hunk, name the values the fork's own code reads from
     the fork's side, such as a returned field or a prop. Taking upstream's
     side drops them.
   - Search upstream's new files and new code for anything the docs' "no …"
     lines removed: a way to start a thread, a model picker, Start fresh, a
     percent, a Usage item.
   - Check exports removed from `shared/` and `src/lib/` that the fork still
     uses, and `package.json`, `pnpm-lock.yaml`, `electron/` and `shared/`
     wire changes.
   - With more than 20 marked commits, split them by area (server, sidebar,
     chat and composer, bot panel and Electron) across parallel Sonnet
     subagents. Give each one its area's doc and the result tree. Check every
     risk they report with git yourself.
   - Done when every marked commit has a verdict: intact, mechanical
     conflict, at risk, or cannot apply.
7. Sort the commits into features, contract changes and touched UI areas.
   Under 100 non-merge commits (`git rev-list --count --no-merges $OLD..$NEW`),
   or when the release notes already explain each change, do it inline
   from the notes and `git log --first-parent`. Above that, send the sorting
   to a Haiku subagent and verify any claim you report as a risk with git.
8. Read [`docs/personal-bot-panel.md`](../../../docs/personal-bot-panel.md),
   [`docs/personal-sidebar.md`](../../../docs/personal-sidebar.md) and
   [`docs/personal-one-chat.md`](../../../docs/personal-one-chat.md), their
   file tables and their "Merging an upstream release" sections, then sort
   each conflict hunk:
   - **Mechanical:** the doc already decides it (the fork's tiles, one page
     with no tabs, no `DetailsTab`), or it is imports, locale keys or tests.
     The sync part resolves these by keeping both sides in the fork's layout.
   - **Layout:** upstream adds UI the doc does not place, such as a new row
     whose card is a real choice. Decide it yourself, as the designer of
     this fork (see "Judge, don't ask").

### Report

Keep it brief, in this order:

1. **Versions:** `main` on `OLD`, upstream `NEW` with its date and commit
   count, bb-1's version.
2. **Will it break:** the conflict table (area, files, hunks), the
   modify/delete conflicts, and the clean-merge risks from step 6.
3. **New features:** the user-visible ones, one line each.
4. **Sync proposals**, in Akbar's proposal layout: merge `NEW` on
   `chore/upstream-<NEW>`, then install the fork's server package on bb-1.
5. **Layout decisions** from step 8: what you decided, each with its
   before/after picture and the fork choice behind it. Akbar can overrule any
   of them in his go.
6. **What it means for him:** for each new setting or behaviour, what it does
   to his bots, with an example, and whether he needs to change anything.
   Default to "no action needed" and say why.

### Judge, don't ask

Akbar wants decisions, not questions about code he doesn't know. Before
you put anything to him, find the reason behind the fork's own change:
read the fork commit that made it (`git log --format='%h %s%n%b' <OLD>..main -- <file>`)
and its row in the doc. Then decide:

- The fork changed it on purpose and upstream's change would undo that
  purpose: keep the fork's version.
- The fork's version only exists to match something upstream has now
  changed: follow upstream, or find a fix that keeps both working, such as
  the fork's whole-row `SwitchRow` serving upstream's new switches.
- Upstream adds something new: place it the way the fork placed similar
  things (labelled cards, rare items in Advanced or their own page, debug
  tools off the panel).

Before you tell Akbar a fact about his data, such as which bots are in a
department, read the field's name from the code's type. Then print one
record's keys on bb-1. Treat an empty result as a wrong query until a
second read confirms it.

Ask Akbar only when no fork choice or doc line points either way, and the
choice changes what his bots do, not just where a row sits. Even then,
explain it first and give your pick.

Akbar doesn't know upstream's code, so a name like "Inspector" or
"`HeavyBotRow`" means nothing to him on its own. Every UI change you
mention (a new row, a moved card, a size or radius) gets a before/after
picture:

- Build a self-contained HTML mockup in a temp folder outside the repo,
  using the real English strings from `src/locales/en.json` and real sizes.
- Show it with `html_preview`, then `html_render`, next to the question it
  explains.
- Put "before" (the fork today) and "after" (your pick) side by side.
  Mark new rows, and label any row that shows only in some cases.
- Say in one sentence what the new thing does for him, with an example.
- State that it is a mockup drawn from the code, not a screenshot.

Stop there and wait for the go.

## Sync

A go on the check report covers every step below, including the layout
answers. Stop only at step 4, for Akbar's OK.

1. **Merge on a branch.** From `main`, run `git switch -c chore/upstream-<NEW>`
   and `git merge --no-ff <NEW>`. Follow the doc's "Merging an upstream
   release" section, and apply the layout answers. Record each answer in the
   doc's file table in the same merge. Read the server rules in `AGENTS.md`
   first: a conflict in a server file keeps the fork's hook and upstream's
   change.
2. **Commit** the merge as `chore: the fork runs upstream <NEW>`, with a body
   that names each layout choice and each non-obvious resolution.
3. **Verify:** run the doc's test list and `i18n:check`, plus the tests named
   after any other conflicted file, then `corepack pnpm typecheck` and
   `corepack pnpm lint`. Run the tests named after the fork's own server
   files too. Then run `python3 -I .claude/skills/upstream-release/lost-lines.py <OLD>`:
   it lists fork lines the merge no longer holds verbatim. Account for each
   one, as a line you merged on purpose or a fork change to put back.
4. **Show it:** run `corepack pnpm dev:personal` and wait for Akbar's OK on
   the changed screens. `dev:personal` talks to bb-1's current server, so a
   screen that needs the new server shows only after step 7.
5. **Land it:** fast-forward `main` to the branch. Do not push unless Akbar
   asks.
6. **Build and test the server package.** Run
   `corepack pnpm package:personal-server`; it prints the tarball's path.
   Install it into an empty folder on mb-0 and start it on its own data
   folder, home and a free port:

   ```sh
   T=$(mktemp -d) && mkdir $T/home $T/data
   npm install --global --prefix $T/prefix release/npm/openmausbot-<version>.tgz
   HOME=$T/home $T/prefix/bin/openmausbot serve --port <free port> --data-dir $T/data --no-pair
   ```

   `curl http://127.0.0.1:<free port>/api/health` must answer
   `{"app":"openmausbot","version":"<version>"}`. Stop that server and
   remove `$T`.
7. **Install on bb-1** (read the `device-fleet` skill first). Check it is
   idle: `ssh bb-1 'systemctl --user status openmausbot --no-pager'` shows
   only the two `node` processes. A `claude` or `codex` child means a bot is
   mid-turn. Wait and check again; after two busy checks, ask Akbar. Then
   copy the tarball to `~/Documents/OpenMausBot/packages/` as
   `openmausbot-personal-<commit>.tgz` and run on bb-1:

   ```sh
   source ~/.nvm/nvm.sh
   B=~/Documents/OpenMausBot
   S=$B/backups/$(date +%F-%H%M)-before-<commit>
   mkdir -p $S
   systemctl --user stop openmausbot
   cp -p $B/data/bots.json $B/data/routines.json $B/data/webhooks.json $B/data/messages.db* $S/
   npm install --global --prefix $B/app $B/packages/openmausbot-personal-<commit>.tgz
   systemctl --user start openmausbot
   ```

   Then confirm the version and `personalCommit` from Check step 3,
   `systemctl --user is-active openmausbot`, and
   `curl -s http://127.0.0.1:8799/api/health` answering `{"app":"openmausbot"}`.
   Compare each automation's `enabled` in `routines.json` and `webhooks.json`
   with the copies in `$S`: a restart must not switch one on or off. Mira's
   mail relay keeps a push it could not deliver and resends it with the next
   one, so a stop of a few seconds loses no mail.
8. **If the start fails,** read `journalctl --user -u openmausbot -n 50`,
   then install the previous tarball from `packages/` with the same `npm
   install` line and start the service. Copy the files in `$S` back only when
   the log names a data file the old server cannot read. Report what
   happened. `openmausbot@<version>` from npm is the official package, the
   last fallback: it ignores the fork's server changes.
9. **Install Personal:** run `corepack pnpm package:personal --install` and
   confirm the running Personal window shows the change. If
   `electron/resources/speech-helper.swift` changed between the tags, run
   `corepack pnpm build:speech` first: `package:personal` otherwise copies
   the old helper out of the installed app.

Never touch bb-1's other services: the Gmail relay and its tunnel, the
watch timers and `otp-cleaner`.
