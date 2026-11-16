# One chat per bot

Each bot has one chat that the person sees, titled "Main Chat". Everything
that runs in the background ends there. Read this before you change the
server, or merge an upstream release tag that touches a file in the table
below.

## What it does

- **Automations.** A routine's, webhook's or app event's run still happens in
  upstream's hidden run thread. Its report goes to the main chat. Upstream
  sent a webhook's and an app event's report to a "<name> · Results" chat.
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
  `"main"` for the bot's main chat.
- **Recall.** A teammate's message and a scheduled or manual routine run
  recall the bot's other conversations, as a person's message does. A side
  job or Burst part the bot started itself does not: its best match was the
  request that started it, and it repeated that request. It reads the main
  chat with `session_search`. A webhook's or app event's run and a Bot API
  chat do not:
  they read text from outside, which could word itself to pull a private
  passage in.
- **New bots** start with a chat titled "Main Chat".

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
`server/one-chat.e2e.test.ts` cover it. Upstream's files only call it:

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
| `server/index.ts` | `exchangeRoute` from `server/one-chat-exchange.ts`, before the bot overview route |
| `server/index.ts` | `threadsPrompt(THREADS_PROMPT)` in the direct turn's prompt |
| `server/index.ts` | a person's message reveals a run thread only when `!isWorkSession(task)` |
| `server/host/chief-notices.ts` | `deps.mainChat` before the notices thread lookup |
| `server/default-bot.ts` | the intro goes to the bot's chat when `oneChatOn()` |
| `server/store.ts` | "Main Chat" as a new bot's first title, and for the chat made when the last one is deleted |
| `server/agents-turn.ts` | `OMB_ONE_CHAT` in the tool process's environment |
| `server/drivers/agents-catalog.ts` | `oneChatTools` in `availableTools` |
| `scripts/control-omb.ts` | the launcher's `oneChat` option |

`server/index.ts` and `server/store.ts` are at their size limit in
`scripts/testing/file-size-ratchet.test.ts`, so each line above joins an
existing line.

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
- A skill a bot added, updated or turned on or off on its own shows as one
  centered line, "Test Bot 1 added a skill: browser-site-login", with no
  Undo and no Details. A click opens that skill's page in the bot panel,
  where its switch and Remove are. Other changes a bot makes on its own keep
  upstream's line.
- No centered line has a chevron.
- A click on anything that names hidden work opens it read only in the same
  modal: a "See run" link, a side job row, an Inbox line, a notification, a
  `#Title` link. `openThread` in
  `src/state/thread-navigation.ts` decides it for all of them, by the
  thread's `routineRunId`, and opens upstream's fork panel state, which
  `WorkModal` shows instead of the side panel. With no chat on screen it
  shows that bot's chat first.
- Hidden work has no message box and no note in its place. A bot reads its
  own hidden sessions with `session_search` when asked why something failed.
- Nothing starts or switches threads: the chat ⋯ menu has no New thread and
  no thread list, the sidebar's bot menu has no thread items, the + menu has
  no "New conversation with", ⌘⇧N does nothing, and a message has no Fork.
- There is no Start fresh. Its divider cut off the bot's context in its only
  chat with one click and no undo. A long chat is summarized by
  auto-compaction, or by Compact on the panel's Context card.

| File | Change |
|---|---|
| `src/state/thread-navigation.ts` | `openThread` opens hidden work in the fork panel |
| `src/state/fork-panel.ts` | `openForkPanel` leaves the bot panel and other side panels open |
| `src/components/ApprovalCard.tsx` | `SkillChangeLine` for a skill change that applied on its own |
| `src/components/bot-panel/panel-link.ts`, `page-registry.ts`, `PanelShell.tsx` | a panel link may name one item (`detail`), so the panel opens on that skill |
| `src/components/ThreadChip.tsx` | `oneChatRow` draws a bot exchange or side job row as `OneChatLine` |
| `src/components/ChatView.tsx` | no message box and no note for hidden work in the fork panel; no Fork on a message |
| `src/components/ChatMoreMenu.tsx` | no `new-thread`, `threads` and `start-fresh` items |
| `src/components/SidebarBotMenu.tsx` | no thread items in Simple's bot menu |
| `src/components/Sidebar.tsx` | no "New conversation with" in the + menu |
| `src/App.tsx` | ⌘⇧N starts no thread; `WorkModal` in place of `ForkPanel`, which neither collapses the sidebar nor closes on a narrow window |
| `src/components/bot-panel/PanelHome.tsx` | no `BotConversations` and no Start fresh row |

Upstream's tests for those menus mock `@/lib/one-chat` with `ONE_CHAT: false`,
so they still test upstream's paths. Add that mock to a new upstream test
that fails on a missing thread item.

## Merging an upstream release

1. For a conflict in a file above, keep upstream's change and put the fork's
   line back.
2. If upstream adds a place that calls `store.createTask` for a bot, decide
   where it leads: the main chat, or a hidden thread with `hideWorkSession`.
   List it here.
3. Run `corepack pnpm exec vitest run server/one-chat src/lib/bot-exchange ThreadChip thread-navigation ChatMoreMenu ApprovalCard panel-link ChatView.controls ChatView.automation SidebarBotRead Sidebar.simple-mode Sidebar.plus-menu Sidebar.working-folder file-size-ratchet`,
   then upstream's tests named after each server file above, with the
   setting off.
