# One chat per bot

Each bot has one chat that the person sees, titled "Main Chat". Everything
that runs in the background ends there. Read this before you change the
server, or merge an upstream release tag that touches a file in the table
below.

## What it does

- **Automations.** A routine's, webhook's or app event's run still happens in
  upstream's hidden run thread. Its report goes to the main chat. Upstream
  sent a webhook's and an app event's report to a "<name> · Results" chat.
  A run that ends on `NOTHING NEW` leaves one post anyway, with the text
  "Nothing new" and `automation.quiet`, so the person sees that it ran. The
  bot's own session never reads that post, and it marks nothing unread and
  sends no notification. Upstream writes nothing for such a run.
- **Bot to bot.** A message from another bot runs in one hidden thread per
  sender, upstream's "@sender · work" thread. The receiving bot's main chat
  gets one row for the message and one for its answer: "Message from Kara: …"
  and "Replied to Kara: …". Each row carries a `threadRef` to the hidden
  thread. The sender's chat gets upstream's own request and result rows.
  `GET /api/bots/<a>/exchange/<b>` returns what two bots said to each other,
  both ways, oldest first, at most 200 lines, with secrets redacted.
- **Side jobs.** `start_thread` on the bot itself always reports back
  (upstream's `report_back`), so the job runs hidden and its result resumes
  the chat that started it.
- **Burst parts and Bot API chats** are hidden.
- **Problems.** The Chief hears of a teammate's failed run in its main chat,
  not in a "Problems to look at" thread.
- **Webhook posts** (`delivery: "post"`) go to the main chat, not "Updates".
- **Tools.** A bot does not see `list_threads`, `close_thread` or
  `rename_thread`. `start_thread`, `post_to_thread` and the threads paragraph
  of the prompt describe hidden work. `post_to_thread` takes `thread_id`
  `"main"` for the bot's main chat. The `trigger` tool's description tells
  a bot to write "reply only NOTHING NEW" for a run with nothing to tell. A
  note on its `instructions` field was not enough: a bot read it and still
  wrote "end quietly". Without it, a bot wrote its own empty reply, such as "nothing to
  report", and every such run posted it as a report.
- **Recall.** A teammate's message and a scheduled or manual routine run
  recall the bot's other conversations, as a person's message does. A side
  job or Burst part the bot started itself does not: its best match was the
  request that started it, and it repeated that request. It reads the main
  chat with `session_search`. A webhook's or app event's run and a Bot API
  chat do not:
  they read text from outside, which could word itself to pull a private
  passage in.
- **New bots** start with a chat titled "Main Chat".
- **Titles.** Upstream titles a new thread from its first message, but only one
  still titled "New thread" or "New task" (`titleTaskFromFirstMessage`), so
  "Main Chat" keeps its name. Only a person's Regenerate title or Rename in
  Advanced mode renames it.
- **Automation turns.** A wait's follow-up runs in the chat that set it, so in one chat it runs in the main
  chat. Upstream treats a chat as an automation's for good once any run used it, which would stop skill
  review, memory capture and cache keep-warm for the bot's only chat. `automatedThread` counts a chat as
  an automation's only while a run works in it, and a run's own thread always.
- **Skill review.** Upstream's review reads a thread's last 40 entries and a digest of everything older,
  up to 40,000 characters. A main chat never ends, so that digest reaches back weeks, and a review wrote a
  replaced rule back into a skill from it. A review that answered stores `reviewedAt`, the time it started,
  on its counter in `skill-review.json`, and `reviewWindow` gives the next review only the messages after
  it. A failed review leaves it as it was. A counter without `reviewedAt` reads the whole chat once.

A hidden thread is a thread whose `routineRunId` starts with `work:`. Every
client already hides a thread that has a `routineRunId`, and a person who
writes in a routine's run thread reveals it; a `work:` thread stays hidden.
No field is new, so an official package reads the same data and shows these
threads as hidden runs.

## The setting

`personal.json` in the data folder with `{ "oneChat": true }` turns it on.
The server reads it at start (`loadOneChat`) and sets `OMB_ONE_CHAT=1` for
itself and the tool processes it starts. With the file absent, the server
behaves as upstream's. Tests turn it on with the launcher's `oneChat` option.

## Files

`server/one-chat.ts` holds the logic, and `server/one-chat-exchange.ts` the
exchange route. The rows' words are `server.oneChat.*` in `en.json`,
`de.json` and `pt-br.json`. `server/one-chat.test.ts` and
`server/one-chat.e2e.test.ts` cover it, with `server/one-chat-automated.e2e.test.ts` and
`server/one-chat-review.e2e.test.ts` for the skill review. Upstream's files only call it:

| File | Line the fork adds |
|---|---|
| `server/index.ts` | `loadOneChat(DATA_DIR)` at start |
| `server/index.ts` | `oneChatMainThread`, used by `resolveResultsThread`, `eventResultsThread`, `resolvePostThread` and `createChiefNotices` |
| `server/index.ts` | in `coordinateBots`: `pairThread` after `workThreadFor`, `hideWorkSession` for a thread it creates, `markPairExchange` "asked" after the enqueue |
| `server/index.ts` | in the coordinator's `report`: `markPairExchange` "replied", after upstream's check for a result row it already wrote, so a restart adds no second row |
| `server/index.ts` | `start_thread`: `oneChatOn()` joins `body.reportBack === true` |
| `server/index.ts` | `hideWorkSession` in the Burst and Bot API `opened` callbacks |
| `server/index.ts` | `withMainThread` around the `post-to-thread` body |
| `server/runtime/envelope.ts` | `sideJobQuote` around the person's quoted request: a side job's note does not quote it |
| `server/host/handoff-sent.ts` | `sideJobLine` around the two rows a side job leaves: "Started a side job: Title" and "Side job finished: Title" |
| `server/index.ts` | `mainChatPosts(store, …)` as the store `leaveThreadPost` writes to: a bot's own post into its main chat is stored as its text, so every client shows it |
| `server/index.ts` | `workSessionRecalls` in the direct turn's `autoRecallPrompt` call |
| `server/index.ts` | `automatedThread(routines, store, …)` in place of `routines?.runForThread(…)` in the skill review, memory capture, memory restore, dream and cache keep-warm checks |
| `server/index.ts` | `reviewWindow(store.activePath(…), since)` in the skill review's `transcript` dep |
| `server/skill-review.ts` | `Counter.reviewedAt`, set by `settleCounter` from a review's `startedAt` when it answered, and passed to `deps.transcript` as `since` |
| `server/index.ts` | `exchangeRoute` from `server/one-chat-exchange.ts`, before the bot overview route |
| `server/index.ts` | `threadsPrompt(THREADS_PROMPT)` in the direct turn's prompt |
| `server/index.ts` | a person's message reveals a run thread only when `!isWorkSession(task)` |
| `server/host/chief-notices.ts` | `deps.mainChat` before the notices thread lookup |
| `server/default-bot.ts` | the intro goes to the bot's chat when `oneChatOn()` |
| `server/store.ts` | "Main Chat" as a new bot's first title, and for the chat made when the last one is deleted |
| `server/host/bot-link-host.ts` | `hideWorkSession` on the "@sender · work" thread `openThread` makes when a bot of the person's other place hands work over |
| `server/agents-turn.ts` | `OMB_ONE_CHAT` in the tool process's environment |
| `server/drivers/agents-catalog.ts` | `oneChatTools` in `availableTools` |
| `scripts/control-omb.ts` | the launcher's `oneChat` option |
| `scripts/testing/control-omb-ui.ts` | `ui launch --one-chat`: a one-chat fixture whose fake engine reads `room-plan.json` in its data folder |
| `server/automation-reports.ts` | with `oneChatOn()`, a quiet run is held like any report, and `write` appends its "Nothing new" post; `newestAutomationLines` skips a quiet post |
| `server/delta-context.ts` | `isContextMessage` leaves out a post with `automation.quiet` |
| `packages/phone-protocol/src/routine-run.ts` | `AutomationLine.quiet` |
| `server/index.ts` | `autoCompactAt` after `nativeCompactTokens`: a turn's context reading carries `compactAt`, the point `compactBudget` gives, so the app can mark it. It is absent with `context.autoCompact` off |
| `server/store.ts`, `packages/phone-protocol/src/wire.ts` | `TaskUsage.context.compactAt` |
| `server/index.ts` | `createInboxMutes` before `createTeamMessages`, its `shape` passed to `createPlaceInbox`, `inboxMuteRoutes` after `createInboxRoutes`, and `dotted` passed to `createAutomationReports` |
| `server/automation-reports.ts` | the optional `dotted` dep: a report it allows also marks its chat unread |
| `server/host/place-inbox.ts` | the optional `shape` dep, applied to the list `view` returns, so `count` follows it |
| `packages/phone-protocol/src/inbox.ts` | `InboxRow.automation` and `InboxView.mutedAutomations` |

`server/index.ts` and `server/store.ts` are at their size limit in
`scripts/testing/file-size-ratchet.test.ts`, so each line above joins an
existing line.

## Inbox

A routine's report lands in the bot's Main Chat and in the Inbox, so one
busy automation can fill the Inbox. "Mute in Inbox" takes one automation's
reports out of it, old ones included. Its questions, approvals and failures
still show, and its Main Chat post and notification are unchanged.

Upstream marks a chat unread for a report only when it failed, asked a
question or needs review. One chat also marks the bot's Main Chat unread for
any other report the Inbox lists, so the sidebar shows a dot. A muted
automation's report and a "Nothing new" post leave it read. `inboxMutes.dots`
decides this through `createAutomationReports`'s `dotted` dep.

`server/inbox-mutes.ts` keeps the muted automation ids in `inbox-mutes.json`
in the data folder. A report's line in `place-inbox.json` names no
automation, so `automationOf` matches the "<name>: " its text starts with
against the bot's routines, webhooks and run names. A run's name covers an
app event's trigger and a name before a rename. `shape` labels each matched
row with `automation` and drops a muted automation's `result` rows.
`POST /api/inbox/automations/<id>/mute` and `/unmute` answer with the new
list, for the place's owner only.

The desktop app mutes from a report read in full (`InboxReading.tsx`), with
Undo on a toast, and from a grey bell beside each switch on the bot panel's
Automations page (`AutomationsPage.tsx`). The bell is always shown in the same
place, and a muted one has a filled background. The Inbox and the bot panel share
one slot: `slotGivesWay` in `simple-side-panel.ts` closes the one open
before, and a bot panel closed that way stays wanted, so it returns when the
Inbox closes.

## Desktop app

`ONE_CHAT` in `src/lib/one-chat.ts` is true in this app.

- A message between two bots shows in each bot's chat as one centered line,
  "Messaged Kara" or "Message from Kara", with Kara's face and no text.
  A click opens the exchange in a modal: both bots' messages, oldest first,
  with the time under each reply.
- A side job shows one centered line when it ends: "Side job finished ·
  Count again", "Side job failed" in red, or "Side job stopped". Its start
  row and its result box are not drawn, because the bot says both in its own
  words. `oneChatRow` in `src/lib/bot-exchange.ts` picks these rows and the
  exchange rows; `OneChatLine` draws them.
- A change a bot makes on its own shows as one centered line, such as "Test
  Bot 1 added a skill: browser-site-login", with no Undo, Cancel, Details or
  Share. A stray click on Undo could delete bots a Chief just added. A click
  on the line opens the place that holds the change: a skill's page, the
  Automations page, the Model card, Bot settings (with the Instructions
  editor when the instructions changed), or the team map for a team setup
  or a department memory save. A deleted skill, automation or bot, a wait
  and an app setting are plain text. A running wait shows its follow-up on
  hover; a person stops it by asking the bot, which has `cancel_wait`.
- No centered line has a chevron.
- A run's post starts with the automation's line inside the post: an icon
  for what started it (webhook, clock, plug for an app event, hourglass for
  a wait, play for Run now), its name and its time. The whole line opens the
  run, so there is no "See run". A failed run says "didn't finish" in red
  with a red left edge, and one that waits on the person says "needs you" in
  amber with an amber edge. A quiet run is the line alone. The post is never
  split into several bubbles or table cards. A copied card keeps the line
  above it. `AutomationHead` in `src/components/AutomationHead.tsx` draws it.
- A click on anything that names hidden work opens it read only in the same
  modal: an automation post's first line, a side job row, an Inbox line, a notification, a
  `#Title` link. `openThread` in
  `src/state/thread-navigation.ts` decides it for all of them, by the
  thread's `routineRunId`, and opens upstream's fork panel state, which
  `WorkModal` shows instead of the side panel. With no chat on screen it
  shows that bot's chat first.
- A run shows no "Run details" bar. Its "Back to results" led to the main
  chat behind the modal, and the Automations page has each automation's
  Logs.
- Hidden work has no message box and no note in its place. A bot reads its
  own hidden sessions with `session_search` when asked why something failed.
- Nothing starts or switches threads: the chat ⋯ menu has no New thread and
  no thread list, the sidebar's bot menu has no thread items, the + menu has
  no "New conversation with", ⌘⇧N does nothing, a message has no Fork, and
  hovering a Simple bot row opens no list of its threads. A bot row lists
  nothing under it: its face and line show a running automation or side job,
  and a side job's question reaches the Inbox's Needs you tab.
- A compaction is one line across the chat with a rule on each side,
  "Context compacted", as T3 Code draws it. The engine's own compaction and
  OpenMausBot's summary draw the same line, with no hint, no summary and no
  "New chat" offer. The
  bot can still find older messages with `session_search`.
- The Context card shows no percent: one row with the bar and "116k / 1M".
  A tick on the bar marks `compactAt`, and hovering the bar says "Compacts on
  its own at 180k". The percent counted against the whole window, so a 1M bot
  read 12% just before a compaction at 180k. The Advanced composer meter shows
  the same. Compact now shows from half of `compactAt` (90k for Mira),
  because the 80% rule that showed it is 800k on a 1M window, past the point
  where the bot compacts, and below half a compaction frees little. Like the
  old rule, it hides after a compaction until the bot replies, and with no
  `compactAt` it falls back to 80% of the window (`compactOffered` in
  `src/lib/context-warning.ts`). It asks "Compact Mira's conversation?" first, because a compaction can't
  be undone. `useCompact` in `src/components/ContextWarning.tsx` asks it for
  the card, the composer meter and the context warning.
- The model is picked only on the panel's Setup card. The chat header has no
  model chip, and the card has no Reasoning row. Its Model row reads like
  "Opus 5.5 · Medium", and its menu has the Thinking row, stays open after a
  pick so the level can be set next, and opens to the thinking level while
  the bot works, as the header menu does upstream. In Advanced mode a stalled
  first reply's Switch AI opens bot settings, since no header chip exists.
- A model's name has no provider: "Opus 5.5", not "Claude Opus 5.5", and
  "DeepSeek V4.1 Flash (Juxta)", not "Cliproxy · DeepSeek V4.1 Flash (Juxta)".
  The menu's headings and the engine icon still tell the engines apart. A
  one-word name such as Cursor's "Auto" keeps its provider. Only the desktop
  drops it; a saved pick stores ids, so nothing else changes.
- A failed reply that a model change fixes (out of credit, at a limit,
  overloaded) offers "Switch model", which opens the panel's Model row.
  Upstream puts a full model picker in the chat there.
- There is no Start fresh. Its divider cut off the bot's context in its only
  chat with one click and no undo. A long chat is summarized by
  auto-compaction, or by Compact on the panel's Context card.

| File | Change |
|---|---|
| `src/state/thread-navigation.ts` | `openThread` opens hidden work in the fork panel |
| `src/state/fork-panel.ts` | `openForkPanel` leaves the bot panel and other side panels open |
| `src/components/ApprovalCard.tsx` | `AppliedLine` for any change that applied on its own, a new automation included, before upstream's `TriggerCard` |
| `src/components/bot-panel/panel-link.ts`, `page-registry.ts`, `PanelShell.tsx` | a panel link may name one item (`detail`), so the panel opens on that skill |
| `src/components/ThreadChip.tsx` | `oneChatRow` draws a bot exchange or side job row as `OneChatLine` |
| `src/components/ChatView.tsx` | no message box and no note for hidden work in the fork panel; no Fork on a message; `AutomationHead` inside an automation's post, or above its copied card, in place of `AutomationCaption`; no run details bar; no model chip |
| `src/components/ChatMoreMenu.tsx` | no `new-thread`, `threads` and `start-fresh` items |
| `src/components/SidebarBotMenu.tsx` | no thread items in Simple's bot menu |
| `src/components/Sidebar.tsx` | no "New conversation with" in the + menu; no activity rows under a bot row, because a row switched the chat to a hidden thread (`Sidebar.one-chat.test.ts`) |
| `src/App.tsx` | ⌘⇧N starts no thread; `WorkModal` in place of `ForkPanel`, which neither collapses the sidebar nor closes on a narrow window |
| `src/components/bot-panel/PanelHome.tsx` | no `BotConversations` and no Start fresh row |
| `src/components/DigestChip.tsx` | `CompactionChip` draws the "Context compacted" line |
| `src/components/bot-panel/ContextCard.tsx`, `src/components/ComposerContextMeter.tsx`, `src/lib/context-meter.ts` | no percent, the `compactAt` tick on `ContextBar`, and Compact now from half of `compactAt` |
| `src/components/ContextWarning.tsx` | `useCompact`: Compact asks first |
| `src/components/bot-panel/PanelHome.tsx`, `src/components/ModelPicker.tsx` | no Reasoning row; the Setup card's Model row (`row`) carries Thinking and the level (`reasoningElsewhere`) |
| `src/components/FirstReplyRescueRow.tsx` | Switch AI opens bot settings in Advanced mode |
| `src/lib/simple-model-menu.ts` | `bareModelLabel` drops the provider from a model's name |
| `src/components/inbox/InboxPanel.tsx`, `InboxRow.tsx`, `InboxReading.tsx` | rows with 32px faces and day headers, a "Needs you" pill on asks and one round Mark done check on hover for news; rows leave out the automation's name, which the reading view shows in full on its own line; the list keeps its scroll and marks the line just read; the reading view has no breadcrumb or menu, and Open in chat, Mark done and Mute in Inbox as buttons |
| `src/components/FailedTurnFix.tsx` | with `ONE_CHAT`, the model fix is a Switch model button that calls `openBotSettings(dispatch, "model")` |
| `src/components/DigestChip.tsx` | `CompactionChip` returns the one-chat line before upstream's `onNewChat` hint |
| `src/components/inbox/inbox-view.ts` | `textOf` drops the automation's name a report starts with |
| `src/components/bot-panel/AutomationsPage.tsx` | the Mute in Inbox bell beside each switch |
| `src/components/bot-panel/simple-side-panel.ts` | `slotGivesWay`: the Inbox and the bot panel share one slot |

Upstream's tests for those menus, the applied-change line, the run details bar, the compaction rows, the context meter, the model picker, the model menu and the rescue row mock `@/lib/one-chat` with `ONE_CHAT: false`,
so they still test upstream's paths. Add that mock to a new upstream test
that fails on a missing thread item.

## Merging an upstream release

1. For a conflict in a file above, keep upstream's change and put the fork's
   line back.
2. If upstream adds a place that calls `store.createTask` for a bot, decide
   where it leads: the main chat, or a hidden thread with `hideWorkSession`.
   List it here.
3. Run `corepack pnpm exec vitest run server/one-chat src/lib/bot-exchange ThreadChip thread-navigation ChatMoreMenu ApprovalCard TriggerCard panel-link ChatView.controls ChatView.automation ChatView.one-chat-automation RoutineResultsNavigation DigestChip ContextCard ComposerContextMeter context-warning ModelPicker simple-model-menu FirstReplyRescueRow FailedTurnRow CompactionChip Sidebar.advanced-back server/store server/automation-reports SidebarBotRead Sidebar.simple-mode Sidebar.one-chat Sidebar.plus-menu Sidebar.working-folder server/inbox-mutes server/host/place-inbox src/components/inbox simple-side-panel file-size-ratchet`,
   then upstream's tests named after each server file above, with the
   setting off.
