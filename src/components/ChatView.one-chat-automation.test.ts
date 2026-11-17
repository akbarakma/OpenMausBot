// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppState, Bot, InstanceInfo, Message } from "@/state/store";

vi.mock("@/lib/one-chat", () => ({ ONE_CHAT: true, hiddenWork: () => false }));
vi.mock("./DesktopCapabilities", async (importOriginal) => ({
  ...await importOriginal<typeof import("./DesktopCapabilities")>(),
  useDesktopCapabilities: () => ({ capabilities: { dictation: { available: false }, host: { packaged: true, platform: "other" }, localComputer: { available: false } }, ready: true }),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/cloud-guest", () => ({ useCanWriteIn: () => true, useReactor: () => "user" }));
vi.mock("./ModelPicker", () => ({ ModelPicker: () => null }));

const { ChatView } = await import("./ChatView");
const { BotEditorStore, initialState } = await import("@/state/store");
const { t } = await import("@/lib/i18n");

const at = (minute: number) => new Date(2026, 9, 21, 9, minute).getTime();
const line = (runId: string, extra: Partial<NonNullable<Message["automation"]>> = {}): NonNullable<Message["automation"]> => ({
  routineId: "inbox", runId, name: "Inbox brief", trigger: "schedule", executionThreadId: `${runId}-thread`, scheduledFor: at(0), ...extra,
});
const transcript = (tail: Message[]): Message[] => [
  { id: "m1", parentId: null, role: "user", kind: "text", text: "Draft the weekly update.", at: at(1) },
  { id: "m2", parentId: "m1", role: "bot", kind: "text", text: "Here is the draft.", at: at(2), turnId: "t1", turnTerminal: true },
  ...tail,
];
const pepper = (messages: Message[]): Bot => ({
  id: "pepper", threadId: "main", name: "Pepper", title: "", description: "", color: "green",
  notifications: true, unread: false, busy: false, messages, activeLeafId: messages.at(-1)!.id, modelSelection: { instanceId: "test", model: "m" },
  tasks: [
    { threadId: "main", title: "Chat", createdAt: 1, busy: false, activity: "idle", modelSelection: { instanceId: "test", model: "m" }, approvalMode: "ask" },
    { threadId: "run-1-thread", title: "Inbox brief · Oct 21", createdAt: 2, busy: false, activity: "idle", routineRunId: "run-1", modelSelection: { instanceId: "test", model: "m" }, approvalMode: "ask" },
  ],
});

const dispatch = vi.fn();
let root: Root;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
async function draw(messages: Message[]) {
  const bot = pepper(messages);
  const state: AppState = {
    ...initialState, connected: true, selectedId: "pepper", bots: [bot],
    instances: [{ instanceId: "test", driverKind: "codex", displayName: "Test", snapshot: { state: "available" } } as InstanceInfo],
  };
  const value = { state, dispatch, flushBotPatches: async () => null, refreshInstances: async () => {}, refreshModels: async () => {} };
  flushSync(() => root.render(createElement(BotEditorStore, { value, children: createElement(ChatView, { bot }) })));
  await settle();
}
const head = (runId: string) => document.querySelector<HTMLElement>(`[data-automation-head="${runId}"]`);
const bubble = (id: string) => document.querySelector<HTMLElement>(`[data-mid="${id}"] [data-chat-bubble]`);

beforeAll(() => {
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterAll(() => {
  root.unmount();
  vi.unstubAllGlobals();
});

describe("an automation's post in one chat", () => {
  it("starts with the automation's line inside the post, and the whole line opens the run", async () => {
    await draw(transcript([{ id: "r1", parentId: "m2", role: "bot", kind: "text", text: "Acme replied about the order.", at: at(3), automation: line("run-1", { trigger: "webhook" }) }]));
    const first = head("run-1")!;
    expect(bubble("r1")?.contains(first)).toBe(true);
    expect(first.tagName).toBe("BUTTON");
    expect(first.textContent).toContain("Inbox brief");
    expect(first.querySelector(".lucide-webhook")).not.toBeNull();
    expect(bubble("r1")?.textContent).toContain("Acme replied about the order.");
    expect(document.querySelector("[data-automation-caption]")).toBeNull();
    expect(document.body.textContent).not.toContain(t("chat.automation.openRun"));
    dispatch.mockClear();
    flushSync(() => first.click());
    expect(JSON.stringify(dispatch.mock.calls)).toContain("run-1-thread");
  });

  it("draws a run with nothing new as its line alone", async () => {
    await draw(transcript([{ id: "q1", parentId: "m2", role: "bot", kind: "text", text: "Nothing new", at: at(3), automation: line("run-1", { quiet: true }) }]));
    expect(bubble("q1")?.contains(head("run-1"))).toBe(true);
    expect(bubble("q1")?.textContent).not.toContain("Nothing new");
    expect(document.querySelector('[data-mid="q1"] button[aria-haspopup="menu"]')).toBeNull();
  });

  it("says a run failed or needs the person in its line and colours the post's edge, and offers no run it cannot open", async () => {
    await draw(transcript([
      { id: "r1", parentId: "m2", role: "bot", kind: "text", text: "Should I send it?", at: at(3), automation: line("run-1", { needsYou: true }) },
      { id: "r2", parentId: "r1", role: "bot", kind: "text", text: "This run didn't finish: signed out.", at: at(4), automation: line("run-gone", { failed: true }) },
    ]));
    expect(head("run-1")?.textContent).toContain(t("chat.automation.needsYou"));
    expect(bubble("r1")?.className).toContain("--color-warning");
    expect(head("run-gone")?.textContent).toContain(t("chat.automation.failed"));
    expect(head("run-gone")?.tagName).toBe("DIV");
    expect(bubble("r2")?.className).toContain("--color-danger");
  });

  it("puts the line above a copy of a card the run waits on", async () => {
    await draw(transcript([{
      id: "c1", parentId: "m2", role: "bot", kind: "options", at: at(3), automation: line("run-1", { needsYou: true }),
      card: { title: "Your bot has a question", subtitle: "Which account should I check?", options: ["Work", "Home"], requestId: "ask-1", requestType: "question" },
    }]));
    expect(head("run-1")?.textContent).toContain(t("chat.automation.needsYou"));
    expect(document.querySelector('[data-mid="c1"]')?.textContent).toContain("Which account should I check?");
  });
});
