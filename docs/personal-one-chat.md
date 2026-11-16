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
- **Recall.** A side job, a Burst part, a teammate's message and a scheduled
  or manual routine run recall the bot's other conversations, as a person's
  message does. A webhook's or app event's run and a Bot API chat do not:
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

`server/one-chat.ts` holds the logic. `server/one-chat.test.ts` and
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
| `server/index.ts` | `workSessionRecalls` in the direct turn's `autoRecallPrompt` call |
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

## Merging an upstream release

1. For a conflict in a file above, keep upstream's change and put the fork's
   line back.
2. If upstream adds a place that calls `store.createTask` for a bot, decide
   where it leads: the main chat, or a hidden thread with `hideWorkSession`.
   List it here.
3. Run `corepack pnpm exec vitest run server/one-chat file-size-ratchet`,
   then upstream's tests named after each file above, with the setting off.
