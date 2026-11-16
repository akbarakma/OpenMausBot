import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import {
  hideWorkSession, isWorkSession, loadOneChat, mainChatPosts, markPairExchange, sideJobLine, MAIN_THREAD_ALIAS, ONE_CHAT_ENV, oneChatOn, oneChatTools,
  pairMarkerLine, pairThread, threadsPrompt, withMainThread, workSessionRecalls,
} from "./one-chat.ts";

const saved = process.env[ONE_CHAT_ENV];
beforeEach(() => { process.env[ONE_CHAT_ENV] = "1"; });
afterEach(() => { if (saved === undefined) delete process.env[ONE_CHAT_ENV]; else process.env[ONE_CHAT_ENV] = saved; });

function fakeStore() {
  const tasks = new Map<string, any>([["main", { threadId: "main", title: "Main Chat" }], ["work", { threadId: "work", title: "@Kara · work" }]]);
  const lines: any[] = [];
  return {
    tasks, lines,
    bot: (id: string) => ({ kara: { id: "kara", name: "Kara" }, mira: { id: "mira", name: "Mira" } } as Record<string, any>)[id],
    botByThread: (threadId: string) => (tasks.has(threadId) ? { id: "mira" } : undefined),
    taskByThread: (_botId: string, threadId: string) => tasks.get(threadId),
    patchTask: (_botId: string, threadId: string, patch: object) => Object.assign(tasks.get(threadId), patch),
    messagesFor: () => lines,
    appendMessage: (threadId: string, message: object) => { const line = { ...message, threadId }; lines.push(line); return line; },
  } as any;
}

it("is off unless the data folder's personal.json turns it on", () => {
  const dir = mkdtempSync(join(tmpdir(), "one-chat-"));
  try {
    const env: Record<string, string | undefined> = {};
    expect(loadOneChat(dir, env)).toBe(false);
    writeFileSync(join(dir, "personal.json"), JSON.stringify({ oneChat: false }));
    expect(loadOneChat(dir, env)).toBe(false);
    writeFileSync(join(dir, "personal.json"), JSON.stringify({ oneChat: true }));
    expect(loadOneChat(dir, env)).toBe(true);
    expect(oneChatOn(env)).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("hides a work session once, and leaves a routine's run and every thread alone while off", () => {
  const store = fakeStore();
  hideWorkSession(store, "work");
  expect(store.tasks.get("work")).toMatchObject({ routineRunId: "work:work", unread: false });
  expect(isWorkSession(store.tasks.get("work"))).toBe(true);
  store.tasks.set("run", { threadId: "run", routineRunId: "a-real-run" });
  hideWorkSession(store, "run");
  expect(store.tasks.get("run").routineRunId).toBe("a-real-run");
  expect(isWorkSession(store.tasks.get("run"))).toBe(false);
  process.env[ONE_CHAT_ENV] = "0";
  hideWorkSession(store, "main");
  expect(store.tasks.get("main").routineRunId).toBeUndefined();
});

it("leaves one row per message in the main chat, only for another bot's hidden exchange", () => {
  const store = fakeStore();
  const ask = { kind: "asked" as const, botId: "mira", workThreadId: "work", mainThreadId: "main", peerBotId: "kara", text: "Delete   the hourly\nroutine" };
  expect(markPairExchange(store, ask)).toBeNull();
  hideWorkSession(store, "work");
  expect(markPairExchange(store, ask)).toMatchObject({
    threadId: "main", kind: "activity", tool: { name: "Message from Kara: Delete the hourly routine", ok: true },
    threadRef: { botId: "mira", threadId: "work", title: "@Kara · work" },
  });
  expect(markPairExchange(store, { ...ask, kind: "replied", text: "Done." })?.tool?.name).toBe("Replied to Kara: Done.");
  expect(markPairExchange(store, { ...ask, peerBotId: "mira" })).toBeNull();
  expect(store.lines).toHaveLength(2);
  expect(pairMarkerLine("asked", "Kara", "x".repeat(300))).toHaveLength("Message from Kara: ".length + 140);
});

it("continues the one hidden exchange a sender has with a bot, whatever session the sender writes from", () => {
  const from = (botId: string, extra: object = {}) => ({ openedBy: { kind: "work", botId, threadId: "elsewhere" }, ...extra });
  const tasks = [
    { threadId: "shown", ...from("kara") },
    { threadId: "other", routineRunId: "work:other", ...from("maui") },
    { threadId: "closed", routineRunId: "work:closed", archivedAt: 1, ...from("kara") },
    { threadId: "pair", routineRunId: "work:pair", ...from("kara") },
  ];
  const store = { tasks: () => tasks } as any;
  expect(pairThread(store, "mira", "kara", () => true)?.threadId).toBe("pair");
  expect(pairThread(store, "mira", "kara", () => false)).toBeUndefined();
  expect(pairThread(store, "mira", "frosty", () => true)).toBeUndefined();
  process.env[ONE_CHAT_ENV] = "0";
  expect(pairThread(store, "mira", "kara", () => true)).toBeUndefined();
});

it("shows a bot no tool that lists, closes or renames threads, and describes a side job as hidden", () => {
  const tools = ["list_threads", "close_thread", "rename_thread", "start_thread", "post_to_thread", "coordinate_bots"].map((name) => ({ name, description: `upstream ${name}` }));
  const shown = oneChatTools(tools);
  expect(shown.map((tool) => tool.name)).toEqual(["start_thread", "post_to_thread", "coordinate_bots"]);
  expect(shown[0]!.description).toContain("out of the person's sight");
  expect(shown[1]!.description).toContain(`"${MAIN_THREAD_ALIAS}"`);
  expect(shown[2]!.description).toBe("upstream coordinate_bots");
  expect(oneChatTools(tools, {})).toEqual(tools);
  expect(threadsPrompt("upstream")).toContain("one chat");
  process.env[ONE_CHAT_ENV] = "0";
  expect(threadsPrompt("upstream")).toBe("upstream");
});

it("sends a post to \"main\" to the main chat, and any other id through unchanged", () => {
  expect(withMainThread({ toThreadId: "main", message: "hi" }, "t1")).toEqual({ toThreadId: "t1", message: "hi" });
  expect(withMainThread({ toThreadId: "t9", message: "hi" }, "t1")).toEqual({ toThreadId: "t9", message: "hi" });
  expect(withMainThread({ toThreadId: "main" }, undefined)).toEqual({ toThreadId: "main" });
  expect(withMainThread(null, "t1")).toBeNull();
});

it("stores a bot's own post into its main chat as its text, and any other post as the posted row", () => {
  const rows: Array<[string, any]> = [];
  const store = { appendMessage: (threadId: string, row: any) => { rows.push([threadId, row]); return row; }, patchTask: () => null } as any;
  const post = { role: "bot", kind: "activity", tool: { name: "Mira posted a message here", ok: true, output: "The backup is done." }, threadPost: { deliveryId: "d1", fromBotId: "b1", fromThreadId: "work" } };
  mainChatPosts(store, "main").appendMessage("main", post as any);
  mainChatPosts(store, "main").appendMessage("other", post as any);
  mainChatPosts(store, undefined).appendMessage("main", post as any);
  expect(rows[0]).toEqual(["main", { role: "bot", kind: "text", text: "The backup is done.", threadPost: post.threadPost }]);
  expect(rows[1]![1]).toBe(post);
  expect(rows[2]![1]).toBe(post);
});

it("recalls other conversations in the bot's own work, never in work that read text from outside", () => {
  const work = { routineRunId: "work:t1" };
  expect(workSessionRecalls(work, { apiFenced: false })).toBe(true);
  expect(workSessionRecalls({ routineRunId: "run-1" }, { apiFenced: false, automationSource: "schedule" })).toBe(true);
  expect(workSessionRecalls({ routineRunId: "run-1" }, { apiFenced: false, automationSource: "webhook" })).toBe(false);
  expect(workSessionRecalls({ ...work, outside: true }, { apiFenced: false })).toBe(false);
  expect(workSessionRecalls({ ...work, botApi: true }, { apiFenced: false })).toBe(false);
  expect(workSessionRecalls(work, { apiFenced: true })).toBe(false);
  expect(workSessionRecalls({ ...work, openedBy: { botId: "b1" } as any }, { apiFenced: false, botId: "b1" })).toBe(false);
  expect(workSessionRecalls({ ...work, openedBy: { botId: "b2" } as any }, { apiFenced: false, botId: "b1" })).toBe(true);
  expect(workSessionRecalls(undefined, { apiFenced: false })).toBe(false);
});

it("words a side job's rows as a job, and leaves a teammate's reply as upstream wrote it", () => {
  expect(sideJobLine("started", "Review PR 12", "Opened thread #Review PR 12")).toBe("Started a side job: Review PR 12");
  expect(sideJobLine("finished", "#Review PR 12", "#Review PR 12 replied")).toBe("Side job finished: Review PR 12");
  expect(sideJobLine("finished", "Mira", "Mira replied")).toBe("Mira replied");
  delete process.env[ONE_CHAT_ENV];
  expect(sideJobLine("started", "Review PR 12", "Opened thread #Review PR 12")).toBe("Opened thread #Review PR 12");
});
