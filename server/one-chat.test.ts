import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import {
  automatedThread, hideWorkSession, isWorkSession, loadOneChat, mainChatPosts, markPairExchange, sideJobLine, sideJobQuote, MAIN_THREAD_ALIAS, ONE_CHAT_ENV, oneChatOn, oneChatTools,
  pairMarkerLine, pairThread, reviewWindow, threadsPrompt, withMainThread, workSessionRecalls,
} from "./one-chat.ts";
import { createSkillReview, type SkillReviewDeps } from "./skill-review.ts";
import { engineIdleMs } from "./drivers/session-idle.ts";
import { personAsks } from "./thread-presence.ts";

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
  const trigger = { name: "trigger", description: "Set up an automation." };
  expect(oneChatTools([trigger])[0]!.description).toMatch(/^Set up an automation\. When a run may find nothing .*must say to reply only NOTHING NEW/);
  expect(oneChatTools([trigger], {})).toEqual([trigger]);
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
  expect(sideJobQuote(true, "start a side job")).toBe("");
  expect(sideJobQuote(false, "ask Mira")).toBe("ask Mira");
  delete process.env[ONE_CHAT_ENV];
  expect(sideJobLine("started", "Review PR 12", "Opened thread #Review PR 12")).toBe("Opened thread #Review PR 12");
});

it("counts a chat as an automation's only while a run works in it, and a run's own thread always", () => {
  const store = fakeStore();
  store.tasks.set("run", { threadId: "run", title: "Daily digest", routineRunId: "run-1" });
  const past = new Set(["main", "run", "room"]);
  const active = new Set<string>();
  const routines = { runForThread: (threadId: string) => (past.has(threadId) ? { id: "run-1" } : null), isActiveThread: (threadId: string) => active.has(threadId) };

  expect(automatedThread(routines, store, "main")).toBe(false);
  expect(automatedThread(routines, store, "run")).toBe(true);
  expect(automatedThread(routines, store, "room")).toBe(true);
  active.add("main");
  expect(automatedThread(routines, store, "main")).toBe(true);
  expect(automatedThread(null, store, "main")).toBe(false);

  active.clear();
  delete process.env[ONE_CHAT_ENV];
  expect(automatedThread(routines, store, "main")).toBe(true);
});

it("gives the skill review a main chat's messages from its last review on, and every message while off", () => {
  const messages = [{ at: 100, text: "old" }, { at: 200, text: "new" }];
  expect(reviewWindow(messages, 100)).toEqual([{ at: 200, text: "new" }]);
  expect(reviewWindow(messages, undefined)).toEqual(messages);
  delete process.env[ONE_CHAT_ENV];
  expect(reviewWindow(messages, 100)).toEqual(messages);
});

it("marks a chat reviewed from when a review that answered started, never from a failed one, across restarts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omb-one-chat-review-"));
  let now = 1_000;
  let fail = false;
  const since: Array<number | undefined> = [];
  const deps = (): SkillReviewDeps => ({
    enabled: () => true,
    threshold: () => 1,
    bot: () => ({ id: "bot", name: "Scout" }),
    engine: () => ({ generateText: async () => { now += 50; if (fail) throw new Error("not logged in"); return '{"changes": []}'; } }),
    busy: () => false,
    transcript: (_botId, _threadId, from) => { since.push(from); return { messages: [], room: false }; },
    skills: () => [],
    currentSha: () => null,
    apply: () => ({ ok: true }),
    statePath: join(dir, "skill-review.json"),
    now: () => now,
  });
  try {
    const review = createSkillReview(deps());
    review.noteTurn("bot", "main", 1);
    expect(await review.run("bot", "main")).toMatchObject({ state: "nothing" });
    now = 2_000;
    fail = true;
    review.noteTurn("bot", "main", 1);
    expect(await review.run("bot", "main")).toMatchObject({ state: "failed" });
    review.stop();

    fail = false;
    const restarted = createSkillReview(deps());
    expect(await restarted.run("bot", "main")).toMatchObject({ state: "nothing" });
    restarted.stop();
    expect(since).toEqual([undefined, 1_000, 1_000]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("keeps a watched chat's engine for the prompt cache's hour and gives back hidden work's after 30 s", () => {
  const policy = { idleMs: 10 * 60_000, minimumMs: 10_000 }, unrationed = { enabled: false, headroom: () => 1 }, now = Date.now();
  personAsks.set("mira-main", now);
  expect(engineIdleMs("mira-main", policy, unrationed, now)).toBe(60 * 60_000);
  expect(engineIdleMs("work:side-job", policy, unrationed, now)).toBe(30_000);
  delete process.env[ONE_CHAT_ENV];
  expect(engineIdleMs("mira-main", policy, unrationed, now), "upstream's ten minutes with the setting off").toBe(10 * 60_000);
});
