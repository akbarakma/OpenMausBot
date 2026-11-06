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
  then This conversation (Find, Activity). Usage is not in the panel
  or the chat's ⋯ menu; the composer's context ring shows it. The list has no New
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
| `src/components/ModelTrigger.tsx` | New: the Simple-mode trigger's contents, moved out of `ModelPicker.tsx` to keep it under its size limit in `scripts/testing/file-size-ratchet.test.ts` |
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
| `src/components/ComposerContextMeter.tsx` | New: the composer's context ring, left of the call and Send slot, with a card on hover or click; Compact now from 80%, as the header pill |
| `src/lib/context-meter.ts` | New: the ring's reading (red above 90%) and the Advanced card's token rows |
| `src/components/Composer.tsx` | Renders `ComposerContextMeter` in one-to-one chats; stays at 1,000 lines for the size ratchet |
| `src/components/ChatMoreMenu.tsx` | No Usage item |
| `src/components/ContextWarning.tsx` | `useCompact` is exported for the ring's card |
| `src/components/SidebarSimpleTop.tsx` | `useTopBandLayout`, `TopBandContext`, `useTopBand`, `TOP_BAND_PAD`, `TOP_BAND_HIT`, `TOP_BAND_BUTTON`; `SidebarSearchField`, the search field in the band's row |
| `src/App.tsx` | Computes the band once and provides `TopBandContext` |
| `src/components/Sidebar.tsx` | In the top band, the top row holds the Inbox button, the search field and New; the Inbox row, the round Search button and the search field below the row are gone |
| `src/components/SidebarInboxRow.tsx` | `band` variant: a 36px round Inbox button with its count and running dot; "Inbox" is its tooltip and label |
| `src/components/ChatHeadPill.tsx` | `band` prop: 36px tall |
| `src/components/ChatView.tsx` | In the top band, the header's top padding, one row at every width, a `lg` model picker and a round computer button |
| `src/components/bot-panel/PanelShell.tsx` | In the top band, the header's top padding and 36px share, gear and close buttons with 18px icons |
| `src/components/ChatMoreMenu.tsx`, `src/components/bot-access/ShareBotButton.tsx` | `ChatShareMenu` and `ShareBotButton` take an `icon` size and stroke |
| `src/components/bot-panel/memory-notes.ts` | `memoryNoteParts` splits `YYYY-MM-DD · from <source> · text` and marks struck or expired notes inactive; `memoryNoteKey` includes the text |

In the top band, `ModelPicker.tsx` has a `lg` size (36px), and `ComputerPanel.tsx` gives its tabs and close
button the band's padding and 36px height.

`TryAsking.tsx` and its test are deleted, and so is `src/lib/chat-usage-summary.ts`. `SwitchRow` in `rows.tsx` is deleted too,
because no page uses it.

## Top band

In Simple mode, in a macOS window with the frame off, the traffic lights sit
alone in a strip at the top. Every top control sits on one row below them.
This covers the sidebar's Inbox button, search field and New, the chat's bot pill,
model picker and computer button, the bot panel's share, gear and close
buttons, and the computer panel's tabs and close button. Each control is 36px
tall, with its top at y=38 and its center at y=56. Round buttons take clicks
2px past their edge, so the target is 40px. `App.tsx` decides once with
`useTopBandLayout` and shares the answer through `TopBandContext`; the sidebar
calls `useTopBandLayout` itself. Framed windows, Advanced mode, the icon rail
(chosen, or forced when a side panel leaves no room), phones and Windows keep
upstream's layout.

Behind the band's row, the chat header's and the sidebar head's glass layer
(`data-glass-band` in `src/styles.css`) is a 40% tint of the surface with no
blur, so what scrolls under it stays sharp and dimmed.

## Strings

New keys sit after `botPanel.memory.addPlaceholder` in `src/locales/en.json`,
translated in every language pack. `botPanel.memoryRow` reads "Memories" and
`botPanel.memory.intro` no longer says "Tap one to remove it".
The ring's `composer.context.*` keys sit after `contextWarning.roomRequested`,
also in every language pack.

## Merging an upstream release

1. List upstream's changes to the files above:
   `git diff <old-tag> <new-tag> -- src/components/bot-panel/ src/components/Composer.tsx src/components/ChatMoreMenu.tsx src/components/ContextWarning.tsx src/lib/usage.ts src/components/ModelPicker.tsx src/components/ModelTrigger.tsx src/components/DefaultBotControls.tsx src/components/bot-settings/BotApiCard.tsx src/components/ComputerPanel.tsx src/state/store.tsx src/components/Sidebar.tsx src/components/SidebarSimpleTop.tsx src/components/SidebarInboxRow.tsx src/components/ChatHeadPill.tsx src/components/ChatView.tsx src/components/bot-access/ShareBotButton.tsx src/App.tsx src/styles.css`.
2. Keep upstream's new rows, settings and behaviour. Place each new row in the
   card it belongs to, with a `RowIcon` and no icon tile.
3. If upstream changes the memory entry grammar in
   `server/memory-entries.ts`, update `memoryNoteParts` and its tests.
4. If upstream brings back an example-asks card, leave it out of `DetailsTab`.
   If upstream brings back a Usage item in `useChatMoreItems`, leave it out.
5. Run `corepack pnpm exec vitest run BotSettingsDialog.simple MemoryPage.team memory-notes PanelShell.dom page-registry Conversations.dom BackupAis.dom ModelPicker ComputerPanel.android ComposerContextMeter context-meter ChatMoreMenu Sidebar.header ChatHeadPill ChatView.controls`,
   `corepack pnpm i18n:check`, `typecheck` and `lint`.
