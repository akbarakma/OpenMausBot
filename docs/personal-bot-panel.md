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

- **Details:** one card with Model and Automations, then the conversation list,
  then This conversation (Find, Activity). Usage is not in the panel
  or the chat's ⋯ menu; the composer's context ring shows it. The list has no New
  conversation button and shows only once the bot has 2 or more conversations;
  New thread stays in the chat header's ⋯ menu. Upstream's "Try asking" card is
  removed. The hero avatar shows the working ring, like the sidebar.
- **Automations:** the row counts the bot's switched-on routines, webhooks and
  app events, where upstream's Routines row counted routines only. Its page
  groups them under Routines, Webhooks and App events, each row with its
  switch. A tap opens the Automations page with that one selected; New
  automation opens that page's New box. Upstream's in-panel routine editor is
  not used. Until routines and app events arrive, the row has no value and the
  page says Checking; a failed routine load shows its error, not an empty list.
  While one switch's request runs, every switch waits.
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
| `src/components/bot-panel/DetailsTab.tsx` | Model and Automations in one card, no Try asking, Model row passes `row`, no `derived` prop |
| `src/components/bot-panel/AutomationsPage.tsx` | New: `useBotAutomations` and the grouped Automations page |
| `src/components/bot-panel/Conversations.tsx` | No New conversation button; a "Conversations" label with search; renders nothing with one conversation |
| `src/components/bot-panel/PanelHero.tsx` | Avatar gets `working` from `sidebarBotStatus` |
| `src/components/bot-panel/page-registry.ts` | `backups` and `botapi` Simple pages; the `routines` page is titled Automations |
| `src/components/ModelPicker.tsx` | `row` prop: in Simple mode with `contained`, the whole row is the picker button, its label and model name share a baseline, and the list opens at the row's width |
| `src/components/ModelTrigger.tsx` | New: the Simple-mode trigger's contents, moved out of `ModelPicker.tsx` to keep it under its size limit in `scripts/testing/file-size-ratchet.test.ts` |
| `src/components/bot-settings/BotApiCard.tsx` | `titled` prop, false on the Bot API page |
| `src/components/DefaultBotControls.tsx` | `HideFromSidebarRow`, the row without its card |
| `src/state/store.tsx` | `openDataResult` takes an optional `cardId`; without one it opens the Data tab; `showRoutines` takes `compose` |
| `src/components/TriggersPage.tsx` | Each row shows its bot's avatar with the status mark on it and the bot's name first in the status line; `compose` focus opens the New box |
| `src/components/SidebarTiles.tsx` | A tile has no fill at rest, `bg-ink/[0.06]` on hover and `bg-ink/[0.10]` when open; badges ring in `panel` |
| `src/components/ComputerPanel.tsx` | A data request without a card opens Data and focuses no card |
| `src/components/bot-panel/LibraryTab.tsx` | "What {name} knows" first, Tables row sends `openDataResult` with no card |
| `src/components/bot-panel/ComputerTab.tsx` | Screen label, Setup card |
| `src/components/bot-panel/SettingsPage.tsx` | Grouped cards, full-width pickers |
| `src/components/bot-panel/BackupAis.tsx` | Only the list and Add; the page intro holds the explanation |
| `src/components/bot-panel/PanelShell.tsx` | `detail` state: the note or skill open in place of its list |
| `src/components/bot-panel/pages.tsx` | Memory note and skill pages, confirm dialogs, Backup AIs and Bot API pages; `routines` renders `AutomationsPage` |
| `src/components/ComposerContextMeter.tsx` | New: the composer's context ring, left of the call and Send slot, with a card on hover or click; Compact now from 80%, as the header pill |
| `src/lib/context-meter.ts` | New: the ring's reading (red above 90%) and the Advanced card's token rows |
| `src/components/Composer.tsx` | Renders `ComposerContextMeter` in one-to-one chats, before Stop so Stop keeps the right-hand slot; stays at 1,000 lines for the size ratchet |
| `src/components/ChatMoreMenu.tsx` | No Usage item |
| `src/components/ContextWarning.tsx` | `useCompact` is exported for the ring's card |
| `electron/window-chrome.mjs` | `TRAFFIC_LIGHTS.unframed` is `{ x: 16, y: 23 }`, so the lights' center is y=30 (upstream: y=16, center y=23) |
| `src/components/SidebarSimpleTop.tsx` | `useTopBandLayout`, `TOP_BAND_HIT`, `TOP_BAND_BUTTON`; `SidebarSearchToggle` takes `band` |
| `src/components/Sidebar.tsx` | `MAC_TRAFFIC_LIGHT_CENTER_Y` is 30. In the top band, the top row holds round Inbox, Search and New, and the Inbox row below is gone. In Simple's icon rail, Search, New and the Inbox square are gone from the top, and the first bot starts 7px under the traffic lights |
| `src/components/SidebarInboxRow.tsx` | `circle` variant: a 36px round Inbox button with its count and running dot; "Inbox" is its tooltip and label |
| `src/components/SidebarSimpleRail.tsx` | The rail's foot holds Apps, the round Inbox button and the account, in that order |
| `src/components/ChatView.tsx` | In the top band, the header's glass layer carries `data-glass-band` |
| `src/components/bot-panel/memory-notes.ts` | `memoryNoteParts` splits `YYYY-MM-DD · from <source> · text` and marks struck or expired notes inactive; `memoryNoteKey` includes the text |

`TryAsking.tsx` and its test are deleted, and so is `src/lib/chat-usage-summary.ts`. `SwitchRow` in `rows.tsx` is deleted too,
because no page uses it.

## Top band

In a macOS window with the frame off, Electron draws the traffic lights with
their center at y=30, 7px lower than upstream. That is the line upstream's
chat header, bot panel and computer panel already sit on, so every top
control in the window shares it. In Simple mode the sidebar's top row holds
round Inbox, Search and New beside the lights, each 36px, with its center at
y=30. Search opens the field under the row, as upstream's does. Round buttons
take clicks 2px past their edge, so the target is 40px. `useTopBandLayout`
decides it. Framed windows, Advanced mode, the icon rail, phones and Windows
keep upstream's row. Advanced's top row is 60px tall, twice
`MAC_TRAFFIC_LIGHT_CENTER_Y`.

In the top band, the chat header's and the sidebar head's glass layer
(`data-glass-band` in `src/styles.css`) is a 40% tint of the surface with no
blur, so what scrolls under it stays sharp and dimmed.

## Simple icon rail

Simple's icon rail has no Search or New. Search is ⌘K, and New is in the
expanded sidebar. The Inbox is a round button at the rail's foot, between
Apps and the account. This applies in every window, framed or not, and when a
side panel forces the rail.

## Strings

New keys sit after `botPanel.memory.addPlaceholder` in `src/locales/en.json`,
translated in every language pack. `botPanel.memoryRow` reads "Memories" and
`botPanel.memory.intro` no longer says "Tap one to remove it".
The ring's `composer.context.*` keys sit after `contextWarning.roomRequested`,
also in every language pack. The `botPanel.automations.*` keys sit at the end
of every pack.

## Merging an upstream release

1. List upstream's changes to the files above:
   `git diff <old-tag> <new-tag> -- src/components/bot-panel/ src/components/Composer.tsx src/components/ChatMoreMenu.tsx src/components/ContextWarning.tsx src/lib/usage.ts src/components/ModelPicker.tsx src/components/ModelTrigger.tsx src/components/DefaultBotControls.tsx src/components/bot-settings/BotApiCard.tsx src/components/ComputerPanel.tsx src/state/store.tsx src/components/Sidebar.tsx src/components/SidebarSimpleTop.tsx src/components/SidebarInboxRow.tsx src/components/SidebarSimpleRail.tsx src/components/ChatView.tsx src/components/TriggersPage.tsx src/components/SidebarTiles.tsx src/styles.css electron/window-chrome.mjs`.
2. Keep upstream's new rows, settings and behaviour. Place each new row in the
   card it belongs to, with a `RowIcon` and no icon tile.
3. If upstream changes the memory entry grammar in
   `server/memory-entries.ts`, update `memoryNoteParts` and its tests.
4. If upstream brings back an example-asks card, leave it out of `DetailsTab`.
   If upstream brings back a Usage item in `useChatMoreItems`, leave it out.
5. Run `corepack pnpm exec vitest run BotSettingsDialog.simple MemoryPage.team memory-notes PanelShell.dom page-registry Conversations.dom BackupAis.dom ModelPicker ComputerPanel.android ComposerContextMeter context-meter ChatMoreMenu Sidebar.header Sidebar.simple-layout SidebarTiles electron/window-chrome`,
   `corepack pnpm i18n:check`, `typecheck` and `lint`.
