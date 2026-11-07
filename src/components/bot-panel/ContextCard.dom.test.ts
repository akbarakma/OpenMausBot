// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot, Message, Task } from "@/state/store";

vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, api: vi.fn(), useStore: () => ({ state: original.initialState, dispatch: vi.fn() }) };
});

const { PanelContextCard } = await import("./ContextCard");

const reply = { id: "m1", role: "bot", kind: "text", text: "Done.", at: 1 } as Message;
const task = (threadId: string, extra: Partial<Task> = {}) =>
  ({ threadId, title: threadId, createdAt: 1, updatedAt: 1, usage: { input: 0, cachedInput: 0, output: 0, costUsd: null, turns: 1, context: { tokens: 180_000, window: 200_000 } }, ...extra }) as Task;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
});

const compact = () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Compact now");

describe("the panel's Context card", () => {
  it("judges Compact now by the open conversation, not by the bot's other work", () => {
    const render = (open: Partial<Task>) => flushSync(() => root.render(createElement(PanelContextCard, {
      bot: { id: "maus", name: "Maus", threadId: "t1", messages: [reply], busy: true, tasks: [task("t1", open), task("t2", { busy: true })] } as Bot,
    })));
    render({ busy: false });
    expect(compact()?.disabled).toBe(false);
    render({ busy: true });
    expect(compact()?.disabled).toBe(true);
  });
});
