import { expect, it } from "vitest";

import type { HandoffView } from "./coordinator.ts";
import { botExchange, exchangeRoute } from "./one-chat-exchange.ts";

const node = (id: string, botId: string, parentId: string | undefined, extra: Partial<HandoffView> = {}): HandoffView => ({
  id, rootId: "root", threadId: `t-${id}`, botId, key: botId, text: `ask ${id}`, createdAt: Number(id.replace(/\D/g, "")) * 10,
  status: "completed", result: `reply ${id}`, reported: true, executions: 1, kind: "assignment", restarts: 0, mode: "work", reply: "resume",
  ...(parentId ? { parentId } : {}), ...extra,
});

const nodes = [
  node("p1", "kara", undefined),
  node("n2", "mira", "p1", { lastProgressAt: 25 }),
  node("p3", "mira", undefined),
  node("n4", "kara", "p3", { lastProgressAt: 45 }),
  node("n5", "kara", "p1", { text: "my own side job" }),
  node("n6", "maui", "p1"),
  node("n7", "mira", "p1", { status: "running", result: "" }),
  node("n8", "mira", "p1", { groupId: "room" }),
];

it("lists both directions between two bots, oldest first, and nothing else", () => {
  const lines = botExchange(nodes, "kara", "mira", (text) => text);
  expect(lines.map((line) => [line.botId, line.text, line.status])).toEqual([
    ["kara", "ask n2", undefined], ["mira", "reply n2", undefined],
    ["mira", "ask n4", undefined], ["kara", "reply n4", undefined],
    ["kara", "ask n7", undefined], ["mira", "", "working"],
  ]);
  expect(lines[1]).toMatchObject({ workThreadId: "t-n2", at: 25 });
  expect(botExchange(nodes, "mira", "kara", (text) => text)).toEqual(lines);
});

it("redacts both sides", () => {
  expect(botExchange(nodes.slice(0, 2), "kara", "mira", () => "[hidden]").map((line) => line.text)).toEqual(["[hidden]", "[hidden]"]);
});

it("answers only GET on the exchange path, and 404 for an unknown or repeated bot", () => {
  const deps = { bot: (id: string) => (["kara", "mira"].includes(id) ? { id } : undefined), nodes: () => nodes, redact: (text: string) => text };
  expect(exchangeRoute("/api/bots/kara/exchange/mira", "POST", deps)).toBeNull();
  expect(exchangeRoute("/api/bots/kara/overview", "GET", deps)).toBeNull();
  expect(exchangeRoute("/api/bots/kara/exchange/nobody", "GET", deps)?.status).toBe(404);
  expect(exchangeRoute("/api/bots/kara/exchange/kara", "GET", deps)?.status).toBe(404);
  expect(exchangeRoute("/api/bots/kara/exchange/mira", "GET", deps)).toMatchObject({ status: 200, body: { lines: expect.any(Array) } });
});
