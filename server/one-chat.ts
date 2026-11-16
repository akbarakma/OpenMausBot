import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Message, Store, TaskRecord } from "./store.ts";

export const ONE_CHAT_ENV = "OMB_ONE_CHAT";
export const PERSONAL_SETTINGS_FILE = "personal.json";
export const MAIN_CHAT_TITLE = "Main Chat";
export const MAIN_THREAD_ALIAS = "main";
const WORK_SESSION = "work:";

type Env = Record<string, string | undefined>;

export function oneChatOn(env: Env = process.env): boolean {
  return env[ONE_CHAT_ENV] === "1";
}

/** Turns one chat on for this process and the tool processes it starts, when the data folder's personal.json asks for it. */
export function loadOneChat(dataDir: string, env: Env = process.env): boolean {
  try {
    if (JSON.parse(readFileSync(join(dataDir, PERSONAL_SETTINGS_FILE), "utf8")).oneChat === true) env[ONE_CHAT_ENV] = "1";
  } catch {
  }
  return oneChatOn(env);
}

// A work session hides behind routineRunId, the field every client already hides a routine's run by.
export function isWorkSession(task: Pick<TaskRecord, "routineRunId"> | null | undefined): boolean {
  return task?.routineRunId?.startsWith(WORK_SESSION) === true;
}

type WorkStore = Pick<Store, "patchTask" | "taskByThread" | "appendMessage" | "bot" | "botByThread">;

export function hideWorkSession(store: Pick<WorkStore, "patchTask" | "taskByThread" | "botByThread">, threadId: string | undefined): void {
  const bot = oneChatOn() && threadId ? store.botByThread(threadId) : undefined;
  if (!bot || !threadId || store.taskByThread(bot.id, threadId)?.routineRunId) return;
  store.patchTask(bot.id, threadId, { routineRunId: `${WORK_SESSION}${threadId}`, unread: false });
}

/** One hidden channel per sender: a bot's message from any of its sessions continues the exchange its main chat began. */
export function pairThread(store: Pick<Store, "tasks">, botId: string, fromBotId: string, usable: (task: TaskRecord) => boolean): TaskRecord | undefined {
  if (!oneChatOn()) return undefined;
  return store.tasks(botId).find((task) => isWorkSession(task) && task.openedBy?.kind === "work" && task.openedBy.botId === fromBotId &&
    !task.openedBy.roomLane && task.archivedAt === undefined && usable(task));
}

/** post_to_thread's "main": a bot in a work session has no thread list to copy its main chat's id from. */
export function withMainThread(body: unknown, mainThreadId: string | undefined): unknown {
  const named = typeof body === "object" && body !== null && (body as { toThreadId?: unknown }).toThreadId === MAIN_THREAD_ALIAS;
  return oneChatOn() && mainThreadId && named ? { ...body, toThreadId: mainThreadId } : body;
}

const SNIPPET_CHARS = 140;
const snippet = (text: string) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > SNIPPET_CHARS ? `${line.slice(0, SNIPPET_CHARS - 1)}…` : line;
};

export type PairMarker = "asked" | "replied";

export function pairMarkerLine(kind: PairMarker, peerName: string, text: string): string {
  const said = snippet(text);
  return `${kind === "asked" ? "Message from" : "Replied to"} ${peerName}${said ? `: ${said}` : ""}`;
}

/** One thin row in a bot's main chat for a message another bot sent it, or for its answer; the row opens the hidden exchange. */
export function markPairExchange(store: WorkStore, input: {
  kind: PairMarker; botId: string; workThreadId: string; mainThreadId: string | undefined; peerBotId: string; text: string;
}): Message | null {
  const { botId, workThreadId, mainThreadId } = input;
  const work = store.taskByThread(botId, workThreadId);
  const peer = store.bot(input.peerBotId);
  if (!oneChatOn() || !mainThreadId || mainThreadId === workThreadId || botId === input.peerBotId || !peer || !isWorkSession(work)) return null;
  return store.appendMessage(mainThreadId, {
    role: "bot",
    kind: "activity",
    tool: { name: pairMarkerLine(input.kind, peer.name, input.text), ok: true },
    threadRef: { botId, threadId: workThreadId, title: work!.title },
  });
}

const HIDDEN_TOOLS = new Set(["list_threads", "close_thread", "rename_thread"]);
const TOOL_DESCRIPTIONS: Record<string, string> = {
  start_thread:
    "Start a side job on yourself: it runs in the background with its own history, out of the person's sight, and its result comes back into this conversation by itself. The person has one chat with you and never sees or opens the job, so do not tell them to look at a thread. Use it only for independent jobs the person asked for (for example one review per pull request), or a second opinion from another model (model_selection from list_models). Give complete instructions in message; the job can read this conversation with session_search when it needs more. You can start at most five per turn; a side job cannot start more jobs. This is not a teammate handoff: use coordinate_bots for teammates.",
  post_to_thread:
    `Write one message to the person in your main chat, from background work: thread_id "${MAIN_THREAD_ALIAS}" is your one chat with them. Use it only when they need to know or decide something now; a routine's final reply already reaches the main chat by itself. It shows as from you. wake true also starts a run there; default false.`,
};

interface CatalogTool { name: string; description: string }

/** The tool list a bot with one chat sees: nothing that lists, closes or renames threads, and side jobs described as hidden work. */
export function oneChatTools<Tool extends CatalogTool>(tools: readonly Tool[], env: Env = process.env): Tool[] {
  if (!oneChatOn(env)) return [...tools];
  return tools.filter((tool) => !HIDDEN_TOOLS.has(tool.name))
    .map((tool) => (TOOL_DESCRIPTIONS[tool.name] ? { ...tool, description: TOOL_DESCRIPTIONS[tool.name]! } : tool));
}

/** A work session of the bot's own (a side job, a Burst part, a teammate's message, a scheduled run) recalls the bot's
 * other conversations.
 * SECURITY: a webhook's or app event's run and a Bot API chat read text from outside, which can word itself to pull a
 * private passage in. They never recall conversations. */
export function workSessionRecalls(task: Pick<TaskRecord, "routineRunId" | "botApi" | "outside"> | undefined,
  turn: { apiFenced: boolean; automationSource?: string }): boolean {
  if (!oneChatOn() || turn.apiFenced || task?.botApi || task?.outside) return false;
  return isWorkSession(task) || turn.automationSource === "schedule" || turn.automationSource === "manual";
}

const ONE_CHAT_PROMPT =
  " The person has one chat with you, and it is the only conversation they see. Background work (a routine's run, a side job you start with start_thread, a teammate's message) runs in a session of its own that they never open. Its result comes back into the main chat by itself, and a teammate's message and your answer show there as one line each. Never tell the person to open, check or look at a thread, and never mention a thread by name. In background work, session_search reads your main chat when you need its context, and post_to_thread with thread_id \"main\" writes the person a message there when they must know or decide something now. When the person says to burst something, or a request is clearly many independent items worked in parallel, use the burst tool: it shows a card, nothing runs until they press Run, and the results come back here as one merged reply.";

export function threadsPrompt(upstream: string): string {
  return oneChatOn() ? ONE_CHAT_PROMPT : upstream;
}
