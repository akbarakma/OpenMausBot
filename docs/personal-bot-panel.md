# Personal bot panel

The bot panel is the side panel that opens from a bot's header in Simple mode.
This fork changes its layout only. Every control writes the same settings
through the same routes as upstream. Read this before you merge an upstream
release tag that touches `src/components/bot-panel/` or another file in the
table below.

## Layout

Each tab and page is a column of labelled cards. Rows put a plain 16px icon,
the title, a value on the right and a chevron on one line. The title and value
share one baseline, and a picker spans its card's full width.

- **Details:** one card with Model and Routines, then the conversation list,
  then This conversation (Find, Usage, Activity). The list has no New
  conversation button and shows only once the bot has 2 or more conversations;
  New thread stays in the chat header's ⋯ menu. Upstream's "Try asking" card is
  removed. The hero avatar shows the working ring, like the sidebar.
- **Library:** "What {name} knows" (Memories, Skills, Folder, Tables), then
  "From this conversation" (pages, apps, files). Tables opens the side panel's
  Data tab.
- **Computer:** a "{name}'s screen" label above the preview, then a Setup card
  with "Works in" and "Signed-in sites".
- **Bot settings (gear):** Profile (Job title, Instructions), Rules (Before it
  acts, Apps it can use), Models (Backup AIs), Calls (Call mode), Advanced
  (Bot API, Hide from sidebar). Backup AIs and Bot API are rows that open their
  own pages. "In this conversation" shows only when the thread's approval
  differs from the bot's.
- **Memories:** one row per note showing only its text; a struck or expired
  note is crossed out. A tap opens the note with its source and date and a
  Delete button.
- **Skills:** one row per skill with a one-line description and its switch.
  A tap opens the full description with the switch and Remove.

Delete on a note and Remove on a skill confirm in `ConfirmDialog` first.

## Files this fork owns

| File | Change |
|---|---|
| `src/components/bot-panel/rows.tsx` | `RowIcon` is a plain 16px icon; `CardSurface`; `PageHeader` title is optional; a `NavRow` with a value keeps its title on one line, truncates the value and puts both on one baseline; on a row with a hint, the value centers on the row like the chevron |
| `src/components/bot-panel/DetailsTab.tsx` | Model and Routines in one card, no Try asking, Model row passes `row` |
| `src/components/bot-panel/Conversations.tsx` | No New conversation button; a "Conversations" label with search; renders nothing with one conversation |
| `src/components/bot-panel/PanelHero.tsx` | Avatar gets `working` from `sidebarBotStatus` |
| `src/components/bot-panel/page-registry.ts` | `backups` and `botapi` Simple pages |
| `src/components/ModelPicker.tsx` | `row` prop: in Simple mode with `contained`, the whole row is the picker button, its label and model name share a baseline, and the list opens at the row's width |
| `src/components/bot-settings/BotApiCard.tsx` | `titled` prop, false on the Bot API page |
| `src/components/DefaultBotControls.tsx` | `HideFromSidebarRow`, the row without its card |
| `src/state/store.tsx` | `openDataResult` takes an optional `cardId`; without one it opens the Data tab |
| `src/components/ComputerPanel.tsx` | A data request without a card opens Data and focuses no card |
| `src/components/bot-panel/LibraryTab.tsx` | "What {name} knows" first, Tables row sends `openDataResult` with no card |
| `src/components/bot-panel/ComputerTab.tsx` | Screen label, Setup card |
| `src/components/bot-panel/SettingsPage.tsx` | Grouped cards, full-width pickers |
| `src/components/bot-panel/BackupAis.tsx` | Only the list and Add; the page intro holds the explanation |
| `src/components/bot-panel/PanelShell.tsx` | `detail` state: the note or skill open in place of its list |
| `src/components/bot-panel/pages.tsx` | Memory note and skill pages, confirm dialogs, Backup AIs and Bot API pages |
| `src/components/bot-panel/memory-notes.ts` | `memoryNoteParts` splits `YYYY-MM-DD · from <source> · text` and marks struck or expired notes inactive; `memoryNoteKey` includes the text |

`TryAsking.tsx` and its test are deleted. `SwitchRow` in `rows.tsx` is deleted too,
because no page uses it.

## Strings

New keys sit after `botPanel.memory.addPlaceholder` in `src/locales/en.json`,
translated in every language pack. `botPanel.memoryRow` reads "Memories" and
`botPanel.memory.intro` no longer says "Tap one to remove it".

## Merging an upstream release

1. List upstream's changes to the files above:
   `git diff <old-tag> <new-tag> -- src/components/bot-panel/ src/components/ModelPicker.tsx src/components/DefaultBotControls.tsx src/components/bot-settings/BotApiCard.tsx src/components/ComputerPanel.tsx src/state/store.tsx`.
2. Keep upstream's new rows, settings and behaviour. Place each new row in the
   card it belongs to, with a `RowIcon` and no icon tile.
3. If upstream changes the memory entry grammar in
   `server/memory-entries.ts`, update `memoryNoteParts` and its tests.
4. If upstream brings back an example-asks card, leave it out of `DetailsTab`.
5. Run `corepack pnpm exec vitest run BotSettingsDialog.simple MemoryPage.team memory-notes PanelShell.dom page-registry Conversations.dom BackupAis.dom ModelPicker ComputerPanel.android`,
   `corepack pnpm i18n:check`, `typecheck` and `lint`.
