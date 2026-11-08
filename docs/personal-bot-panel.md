# Personal bot panel

The bot panel is the side panel that opens from a bot's header in Simple mode.
This fork changes its layout only. Every control writes the same settings
through the same routes as upstream. Read this before you merge an upstream
release tag that touches `src/components/bot-panel/` or another file in the
table below.

## Layout

The panel is one page with no tabs, plus drill-in pages. Each is a column of
labelled cards. Rows put a plain 16px icon,
the title, a value on the right and a chevron on one line. The title and value
share one baseline, and a picker spans its card's full width.

The whole row is the click target. A row with only a switch is a `<label>`
(`switchRowCls`), so a click anywhere on it flips the switch. A row that opens
a page and also has a switch (Skills, Automations) stretches its open button
over the row (`openRowCls`), with the switch on top. Both kinds highlight the
full row on hover. Switches and the browser tile end 18px from the card edge,
where a chevron's drawn stroke ends, so their right edges line up.

- **First page**, top to bottom:
  - **Browser:** a card with a "Bot's browser" row (a screen place: "Bot's
    screen", never the bot's name), a status line and a 72×45 tile. The whole
    row opens the full-window browser. Below it: Works in and "Let Bot use a
    browser"; with the browser off, the top row hides.
    - Not browsing: "Sleeping" and rising Zs (`panel-zzz`).
    - Browsing: a green dot, "Browsing" and the live page, once the turn calls
      a browser tool (`browsingNow`; a code-mode `execute` counts once its
      output lists a `browser.` tool). Only then does the card connect: a
      viewer wakes an asleep Chrome.
    - After the turn: a grey dot, "Done" and the live page for 5 minutes
      (`useBrowsingHeld`), then Sleeping. bb-1 closes an idle browser after 10.
      The hold is set during render, not in an effect, so the live view never
      drops for a render and flashes black. No picture is stored.
    - The tile is a passive `StreamSurface`, filled from the top; its outline
      sits above the content.
    - A screen place shows the chat's last screen picture, or the Zs, and
      opens upstream's popup on Screen. That picture can be an old browser
      page: screen pictures don't record their source.
    - bb-1's live stream runs one command per bot at a time, so a view opened
      during a bot's browser command shows "{name} is using this browser".
  - **Setup:** Model and Automations.
  - **What {name} knows:** Memories, Skills, Folder and Data. Folder shows the
    open chat's own folder when it keeps one, else the bot's. Data opens the
    Data page.
  - **This conversation:** Files (with a count), Find, and Activity.
  - **Context:** the conversation's share of the model's window, its bar, and
    Compact now from 80%. It shows once the conversation reports usage.
  - **Conversations:** the list, shown once the bot has 2 or more.
  Usage is not in the chat's ⋯ menu. In Simple mode the composer has no
  context ring and the chat shows no context warning; Advanced keeps both. The list has no New conversation button; New thread stays in the
  chat header's ⋯ menu. Upstream's "Try asking" card is removed. The hero
  avatar shows the same face as the sidebar and chat header (see "One face per
  bot" below). The Signed-in sites row is hidden; its page stays for links, and
  the list stays in the browser's Manage profiles.
- **Data, Files, Activity pages:** Data embeds upstream's `DataPanel` with its
  own Fullscreen. Files lists the chat's pages, apps and files, each file with
  its folder. Activity is upstream's list (`ActivityList`); its Reload button
  sits on the title line through `PageHeader`'s `action`. `dayBg="bg-app"`
  matches the sticky day heading to the panel page.
- **Folder page:** a chat that keeps its own folder shows it on top with
  upstream's "This chat keeps its current folder" hint.
- **Works in page:** a chat a person pinned to another place says so, with
  upstream's "Use {place}" button.
- **Automations:** the row counts the bot's switched-on routines, webhooks and
  app events, where upstream's Routines row counted routines only. Its page
  groups them under Routines, Webhooks and App events, each row with its
  switch. A tap opens the Automations page with that one selected; New
  automation opens that page's New box. Upstream's in-panel routine editor is
  not used. Until routines and app events arrive, the row has no value and the
  page says Checking; a failed routine load shows its error, not an empty list.
  While one switch's request runs, every switch waits.
- **Bot settings (gear):** Profile (Job title, Instructions), Rules (Before it
  acts, Apps it can use), Models (Backup AIs), Calls (Call mode), Advanced
  (Bot API, Hide from sidebar). Backup AIs and Bot API are rows that open their
  own pages. "In this conversation" shows only when the thread's approval
  differs from the bot's.
- **Memories:** one row per note showing only its text; a struck or expired
  note is left out, as the server no longer reads it. A tap opens the note
  with its source and date and a Delete button.
- **Skills:** two cards, split by the `origin` each skill carries. The bot's
  own card lists every skill it can switch (learned, added by link, library,
  from this computer), or says it has learned none yet. A tap opens the full
  description with the switch and Remove. A skill from this computer has no
  Remove, because the server keeps it for every bot. The global card lists
  `native` skills, the ones the engine loads from a skills folder such as
  bb-1's `~/.claude/skills`. It starts folded, with the count and "{bot} loads
  these on its own", and each row reads "Always on". A tap shows "{bot} loads
  this on its own" and the skill's folder, with no switch or Remove, because
  the server rejects both for a native skill.
  A switch reads `skillSwitchOn`, not `enabled`: a skill from this computer
  can be on but left out of the bot's list (`listed: false`), and the bot
  finds it by search. Its switch shows off, the Skills count leaves it out,
  and its page says "Not in this bot's list". A tap puts it in the list.
  `SkillsPage.dom.test.ts` covers the split and the unlisted skill.

Delete on a note and Remove on a skill confirm in `ConfirmDialog` first.

## The panel stays open

In Simple mode the panel stays open until its ✕ or the header pill closes it;
Escape no longer closes it. `simple-side-panel.ts` stores that choice in
`localStorage` (`omb-personal-bot-panel`). When whatever covered the panel
goes (a full page, the Inbox, App settings, another side panel, the browser),
the panel opens again without taking focus, on the page each bot last showed
(`lastStack` in `PanelShell.tsx`). In a window narrower than 768 px, where the
sidebar is not inline, it does not reopen by itself.

Each page and gear page keeps its scroll position per bot (`lastScroll` in
`PanelShell.tsx`). Back returns to where the list was; a newly opened page
starts at the top.

The panel body always keeps its 8 px scrollbar gutter (`[scrollbar-gutter:stable]`
with `pl-4 pr-2`), so a page that scrolls is as wide as one that does not. A
child that runs to both edges uses `-ml-4 -mr-2`, as the Activity list does;
`-mx-4` would push it 8 px into the gutter. Its rows take `pr-2`, so their text
ends on the cards' right edge.

`useSimpleSidePanel` in App also redirects every request for the computer
popup and the Activity panel, so upstream's callers need no change:

- Data and Files requests open those panel pages.
- A browser request, a browser sign-in and a published page open the
  full-window browser.
- A screen place, or a bot with its browser off, keeps upstream's popup.
- Activity opens the Activity page.

Upstream's Watch pill (`WatchScreenButton`) shows in the chat header in both
modes while a tool call uses the bot's screen. In Simple it goes through the
same redirect: a browser call opens the full-window browser, and a screen call
opens upstream's popup. The monitor button stays hidden in Simple.

Advanced mode and the remote client keep upstream's popup, monitor button and
Activity panel.

## Full-window browser

`SimpleBrowserWindow` draws `LiveBrowser` over the whole app window. Its first
row is 60px tall and drags the window. With the macOS inset it starts 84px in,
clear of the traffic lights. The row holds a "{name}'s browser" chip, the tabs,
the control pill, the profile button and "Back to chat". It has no maximize or
full-screen button. The address bar is the second row, and a browser sign-in
banner sits under it. Escape goes back to the chat, except in a text field or an
open dialog. The window closes when another bot is selected.

The panel's card is `LiveBrowserCard`, a watch-only `StreamSurface` with
`passive`. The newest viewer's size resizes the bot's real page
(`server/browser/viewers/core.ts`), so a passive view connects without a size
and never sends one. Opening a view starts an asleep browser, so the card
connects only while the bot works. It disconnects while the full window is
open or the app is hidden. The Simple guided tour no longer opens the computer.
If the person still holds the browser when the full window closes, the card
stays away for 2 minutes (`useHoldGrace`). The server hands a hold back 2
minutes after the person's last view closes, and any view of theirs that opens
stops that clock, the card's too, which would leave only the 5-minute idle
limit.

On the agent-browser stream bb-1 uses, the card acks frames at most every
400 ms. The server sends two frames per ack, so the tile runs near 5 frames a
second; the full window keeps the full rate.

## Animations stop while the window is unfocused

Any endless animation makes Chromium redraw the whole window every frame. The
sleeping Zs alone cost about 20% of a core in the GPU process. While the window
is not focused, `src/lib/window-focus.ts` marks each element with an endless
CSS animation `data-unfocused-paused`, and `styles.css` pauses it. One-shot
animations run on, so nothing stops halfway through a fade-in. The mascot clock
stops too, but it still draws a new face's first frame, because the face is
drawn by that frame. Paused Zs show their still frame. In the desktop app the
focus comes from the window (`windowControls.onFocusChanged`), because Electron
43 reports `document.hasFocus()` as true after a reload in an unfocused window.
Measured in `dev:personal`: 26–29% GPU and 10–13% renderer focused with the Zs
on screen, under 1.5% for both while unfocused.

## One face per bot

The selected bot shows one face in the sidebar row or tile, the chat header and
the panel hero. `useBotFace` in `src/components/bot-face.ts` gives all of them
the same state, motion beat and working ring.

- In Simple mode a selected bot at rest shows `happy`, over its role face and a
  pinned face. A failed tool (`alerting`) and a waiting question (`curious`)
  keep their own animated face. Advanced mode keeps the bot's own face and has
  no hop.
- At rest the sidebar copy and the panel hero move together: one soft hop
  every 4 s with the `bot-rest-hop` CSS animation in `src/styles.css`, and one
  blink per cycle after the hop lands (`nextRestBlink`). Both read the rest
  moment from `restOrigin`, so a panel opened late joins in step. Each hop's
  animation `startTime` is that moment, and it is set again on refocus, because
  the unfocused pause resumes a loop where it stopped. The hero moves only
  while it is on screen. The chat header's face never moves: it changes
  expression without motion, ring or beats. The compositor runs the hop without
  redrawing the face, and the still part of the cycle draws no frames. A
  JavaScript loop on three faces cost 13 to 23% of a CPU core, and a
  continuous CSS hop on two faces about 21%. Measured in `dev:personal` with
  the panel open and its Zs hidden: 5.3% GPU and 5.5% renderer with both faces
  hopping, 6.2% and 5.5% with only the sidebar's. A hop in the air lands before
  it stops. A Halloween body holds its carved face still under the hop.
- Picking a bot plays the `switch` beat (spin and ring sweep) in the sidebar and
  the panel, then the hop.
- Other bots animate only while they work or play an unread notice.
- Body motion cross-fades over `BLEND_MS` (500 ms) on every state change,
  entrances included, and a face that stops animating eases to its still pose
  before it pauses. A beat that has run passes no motion, so a remounted face
  does not replay it.
- Repeating bob, sway and pulse waves read the page clock, so every copy of a
  face in one state moves in step.

## Files this fork owns

| File | Change |
|---|---|
| `src/components/bot-panel/rows.tsx` | `RowIcon` is a plain 16px icon; `CardSurface`; `PageHeader` title is optional; a `NavRow` with a value keeps its title on one line, truncates the value and puts both on one baseline; on a row with a hint, the value centers on the row like the chevron |
| `src/components/bot-panel/PanelHome.tsx` | New, from upstream's `DetailsTab.tsx`: the one first page |
| `src/components/bot-panel/simple-side-panel.ts` | New: the open state, the quiet reopen, and the popup and Activity redirects |
| `src/components/bot-panel/browser-window.ts` | New: which bot's browser fills the window; `browserWindowClosed` and `useHoldGrace` |
| `src/components/bot-panel/SimpleBrowserWindow.tsx` | New: the full-window browser |
| `src/components/bot-panel/LiveBrowserCard.tsx` | New: the watch-only browser in the Computer card |
| `src/components/BrowserPanel.tsx` | `LiveBrowser` takes `window` (`onBack`, `banner`); closing it reports whether the person still held the browser |
| `src/components/browser/ChromeRow.tsx` | `windowBar`: the 60px first row |
| `src/components/browser/StreamSurface.tsx` | `passive`: never sends a resize |
| `src/components/ActivityPanel.tsx` | `ActivityList`, shared with the Activity page |
| `src/App.tsx` | Calls `useSimpleSidePanel`; draws `SimpleBrowserWindow`; hides the popup and Activity panel it redirects |
| `src/components/BotSettingsDialog.tsx` | Simple panel: Escape does not close it, ✕ records the close, a quiet reopen leaves focus alone |
| `src/lib/guided-tour.ts` | Simple tour steps never open the computer |
| `src/components/bot-panel/AutomationsPage.tsx` | New: `useBotAutomations` and the grouped Automations page |
| `src/components/bot-panel/Conversations.tsx` | No New conversation button; a "Conversations" label with search; renders nothing with one conversation |
| `src/components/bot-panel/PanelHero.tsx` | Avatar takes its props from `useBotFace`, with `hops` while it is on screen; no `activeState` prop |
| `src/components/bot-panel/ContextCard.tsx` | New: the Context card on the first page; Compact now waits only on the open conversation, not the bot's other work |
| `src/components/bot-panel/PanelShell.tsx` | No `activeState` passed to `PanelHero`; no tabs, `PanelHome` under the hero; `lastStack` per bot; Back at the root names the bot |
| `src/components/bot-face.ts` | New: `useBotFace` (`hops` for the sidebar copies and the panel hero), `botFaceState` and `restOrigin` |
| `src/components/Avatar.tsx` | `BotAvatar` takes `restingSince`, wraps the face in the hop and starts its animation at that moment; `MausAvatar` passes `still` and `restClock` |
| `src/components/ChatHeadPill.tsx` | `avatar` is only a state; the face never animates |
| `src/styles.css` | `.bot-rest-hop` and its keyframes; `.panel-zzz`; `[data-unfocused-paused]` |
| `src/components/mascot-motion.ts` | `startMotion`, `mixTransform`, `retargetBody`: blended body motion on the page clock, replacing `bodyTransform`; `REST_HOP_MS`, `REST_CYCLE_MS` and `nextRestBlink` |
| `src/components/CursorAvatar.tsx` | Draws the body from the motion mix; a paused face eases to rest first; `still` holds the body and stops expression changes but keeps blinks; `blinkScale` moved to `mascot-motion.ts` and no `MOTION` re-export, to stay at its size limit; with `restClock` it blinks on `nextRestBlink`, not a random timer |
| `src/components/ChatView.tsx` | Header avatars take `useBotFace` with `sidebarBotStatus`'s `running`; no monitor button in Simple; the pill's close records it |
| `src/components/PinnedCircleThreads.tsx` | Avatar takes `useBotFace` |
| `src/components/bot-panel/page-registry.ts` | `backups`, `botapi`, `data`, `files` and `activity` Simple pages; the `routines` page is titled Automations; no tabs, a section lands on a page or a first-page card |
| `src/components/bot-panel/panel-link.ts` | `linkTarget` returns a page or a card, no tab |
| `src/components/ModelPicker.tsx` | `row` prop: in Simple mode with `contained`, the whole row is the picker button, its label and model name share a baseline, and the list opens at the row's width |
| `src/components/ModelTrigger.tsx` | New: the Simple-mode trigger's contents, moved out of `ModelPicker.tsx` to keep it under its size limit in `scripts/testing/file-size-ratchet.test.ts` |
| `src/components/bot-settings/BotApiCard.tsx` | `titled` prop, false on the Bot API page |
| `src/components/DefaultBotControls.tsx` | `HideFromSidebarRow`, the row without its card |
| `src/state/store.tsx` | `openDataResult` takes an optional `cardId`; without one it opens the Data tab; `showRoutines` takes `compose` |
| `src/components/TriggersPage.tsx` | Each row shows its bot's avatar with the status mark on it and the bot's name first in the status line; the name and the sentence keep one line each, in full on hover; `compose` focus opens the New box |
| `src/components/SidebarTiles.tsx` | A tile is 100×112: the face, the name, and the job title in `TITLE_CHIP` under it. 100px keeps two tiles across the 240px minimum sidebar, scrollbar included. A tile has no fill at rest, `bg-ink/[0.06]` on hover and `bg-ink/[0.10]` when open; badges ring in `panel`; avatar takes `useBotFace` |
| `src/components/ComputerPanel.tsx` | A data request without a card opens Data and focuses no card |
| `src/components/bot-panel/LibraryTab.tsx` | `KnowsCard`, `MadeHere` and `chatFolder`, shared with the first page; the Skills row counts only the bot's own switched-on skills, not native ones; Advanced's library still sends `openDataResult` with no card |
| `src/components/bot-panel/ComputerTab.tsx` | `ComputerCard` (live card, Works in, browser switch); `WherePage` pinned-place note |
| `src/components/bot-panel/SettingsPage.tsx` | Grouped cards, full-width pickers |
| `src/components/bot-panel/BackupAis.tsx` | Only the list and Add; the page intro holds the explanation |
| `src/components/bot-panel/PanelShell.tsx` | `detail` state: the note or skill open in place of its list; the body keeps its scrollbar gutter with `pl-4 pr-2` |
| `src/components/bot-panel/pages.tsx` | Memory note and skill pages, confirm dialogs, Backup AIs and Bot API pages; `routines` renders `AutomationsPage`; Data, Files and Activity pages; the chat's folder on the Folder page |
| `src/components/ComposerContextMeter.tsx` | New: the composer's context ring, left of the call and Send slot, with a card on hover or click that always shows the token table, since only Advanced mounts it; Compact now from 80%. `ContextBar` and `CompactButton` are shared with the panel's Context card |
| `src/lib/context-meter.ts` | New: the ring's reading (red above 90%) and the Advanced card's token rows |
| `src/components/Composer.tsx` | Renders `ComposerContextMeter` in Advanced one-to-one chats, before Stop so Stop keeps the right-hand slot; stays at 1,000 lines for the size ratchet |
| `src/components/ChatMoreMenu.tsx` | No Usage item |
| `src/components/ContextWarning.tsx` | `useCompact` is exported for the ring's card |
| `electron/window-chrome.mjs` | `TRAFFIC_LIGHTS.unframed` is `{ x: 16, y: 23 }`, so the lights' center is y=30 (upstream: y=16, center y=23) |
| `src/components/SidebarSimpleTop.tsx` | `useTopBandLayout`, `TOP_BAND_HIT`, `TOP_BAND_BUTTON`; `SidebarSearchToggle` takes `band` |
| `src/components/Sidebar.tsx` | A Simple row shows the name, then the job title in a small dark chip (`TITLE_CHIP`) that truncates first; its avatar takes `useBotFace`. `MAC_TRAFFIC_LIGHT_CENTER_Y` is 30. In the top band, the top row holds round Inbox, Search and New, and the Inbox row below is gone. In Simple's icon rail, Search, New and the Inbox square are gone from the top, the first bot starts 20px under the traffic lights, a line sits under the chief, and the tiles have no native tooltip: `SidebarRailCard` shows a card on hover instead. In Simple's chat view the header has no context warning |
| `src/components/SidebarInboxRow.tsx` | `circle` variant: a 36px round Inbox button with its count and running dot; "Inbox" is its tooltip and label |
| `src/components/SidebarSimpleRail.tsx` | The rail's foot holds Apps, the round Inbox button and the account, in that order |
| `src/components/SidebarRailCard.tsx` | New: the rail's hover card. It opens 300 ms into a hover, or at once while one is open, centered on the tile 8px right of the rail. A bot's card shows a still face, the name, the title chip, a status line when there is one, and the newest line on up to 2 lines; a room's shows its faces, name and newest line |
| `src/components/SidebarRowMarkers.tsx` | `TITLE_CHIP`, shared by the row and the hover card |
| `src/components/SidebarProfileMenu.tsx` | The account trigger is a flex box, so the photo centers on the Apps pill instead of sitting 3.5px high on a text line |
| `src/components/ChatView.tsx` | In the top band, the header's glass layer carries `data-glass-band` |
| `src/lib/window-focus.ts` | New: `windowFocused`, `onWindowFocusChange`, `pauseLoopsWhileUnfocused` (called in `src/main.tsx`) |
| `src/components/mascot-clock.ts` | `asleep`/`onAsleepChange` replace `documentHidden`/`onDocumentVisibility` and include window focus; a face added while asleep gets one frame |
| `src/lib/browser-stream-v1.ts` | `createLiveStreamClient` takes `ackEveryMs` |
| `electron/preload.cjs`, `electron/personal-dev-preload.cjs` | `windowControls.onFocusChanged` |
| `electron/main.mjs`, `electron/personal-dev.mjs`, `electron/window-state-file.mjs` | `window:state` returns `focused`; focus and blur send `window:focus-changed` |
| `src/components/bot-panel/memory-notes.ts` | `memoryNoteParts` splits `YYYY-MM-DD · from <source> · text` and marks struck or expired notes inactive; `panelMemoryNotes` leaves inactive notes out; `memoryNoteKey` includes the text |

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
of every pack. `browser.window.title`, `browser.window.back` and the
`browser.card.*` keys (title, browsing, done, switch) sit after
`botPanel.knows` in every pack. `zh-tw.json` is the exception: upstream sorts
it, so the fork's keys sit in upstream's order, and keys new to it go at the
end.

## Merging an upstream release

1. List upstream's changes to the files above:
   `git diff <old-tag> <new-tag> -- src/components/bot-panel/ src/components/Composer.tsx src/components/ChatMoreMenu.tsx src/components/ContextWarning.tsx src/lib/usage.ts src/components/ModelPicker.tsx src/components/ModelTrigger.tsx src/components/DefaultBotControls.tsx src/components/bot-settings/BotApiCard.tsx src/components/ComputerPanel.tsx src/state/store.tsx src/components/Sidebar.tsx src/components/SidebarSimpleTop.tsx src/components/SidebarInboxRow.tsx src/components/SidebarSimpleRail.tsx src/components/ChatView.tsx src/components/TriggersPage.tsx src/components/SidebarTiles.tsx src/styles.css electron/window-chrome.mjs src/App.tsx src/components/BotSettingsDialog.tsx src/components/BrowserPanel.tsx src/components/browser/ src/components/ActivityPanel.tsx src/lib/guided-tour.ts`.
2. Keep upstream's new rows, settings and behaviour. Place each new row in the
   card it belongs to, with a `RowIcon` and no icon tile.
3. If upstream changes the memory entry grammar in
   `server/memory-entries.ts`, update `memoryNoteParts` and its tests.
4. If upstream brings back an example-asks card, leave it out of `PanelHome`.
   If upstream adds a caller that opens the computer popup or Activity panel,
   it goes through `toggleComputer` or `toggleActivity`, so the redirect in
   `simple-side-panel.ts` covers it. Check that it does.
   If upstream brings back a Usage item in `useChatMoreItems`, leave it out.
   Upstream changes to `DetailsTab.tsx` do not apply: `PanelHome` replaced it.
   Delete any new `DetailsTab` test with it.
5. Resolve locale conflicts key by key, not by line. Keep both sides' new
   keys. When upstream re-sorts a pack, start from upstream's copy, then apply
   the fork's added, changed and deleted keys. In `source-hashes.json`, drop
   upstream's entries for keys the fork deleted, and keep the fork's hash for
   keys whose English the fork changed. `i18n:check` fails on any miss.
6. Run `corepack pnpm exec vitest run BotSettingsDialog.simple MemoryPage.team memory-notes PanelShell.dom page-registry panel-link simple-side-panel Conversations.dom BackupAis.dom ModelPicker ComputerPanel.android ComposerContextMeter context-meter ChatMoreMenu ChatView.controls Sidebar.header Sidebar.simple-layout SidebarTiles electron/window-chrome BrowserPanel ChromeRow StreamSurface guided-tour SkillsPage.dom`,
   `corepack pnpm i18n:check`, `typecheck` and `lint`.
