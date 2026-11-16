import { expect, it } from "vitest";
import { oneChatRow } from "./bot-exchange";

const asker = { id: "one", threadId: "one-main", tasks: [{ threadId: "one-main" }, { threadId: "one-job", openedBy: { botId: "one" } }] };
const answerer = { id: "three", threadId: "three-main", tasks: [{ threadId: "three-main" }, { threadId: "three-work", openedBy: { botId: "one" } }] };
const bots = [asker, answerer];
const work = { botId: "three", threadId: "three-work", title: "@Test Bot 1 · work" };
const job = { botId: "one", threadId: "one-job", title: "Count" };

it("names the other bot on both sides of an exchange, and which way the message went", () => {
  const sent = { from: { botId: "one" }, tool: { name: "Sent to Test Bot 3" }, threadRef: work };
  const result = { from: { botId: "three" }, roomRequest: { phase: "result" }, tool: { name: "Test Bot 3 replied" }, threadRef: work };
  const asked = { tool: { name: "Message from Test Bot 1: what code word?" }, threadRef: work };
  const replied = { tool: { name: "Replied to Test Bot 1: PLUMERIA-42" }, threadRef: work };
  expect(oneChatRow(sent, "one-main", bots)).toEqual({ kind: "exchange", ownId: "one", peerId: "three", sent: true });
  expect(oneChatRow(result, "one-main", bots)).toEqual({ kind: "exchange", ownId: "one", peerId: "three", sent: false });
  expect(oneChatRow(asked, "three-main", bots)).toEqual({ kind: "exchange", ownId: "three", peerId: "one", sent: false });
  expect(oneChatRow(replied, "three-main", bots)).toEqual({ kind: "exchange", ownId: "three", peerId: "one", sent: true });
});

it("marks a side job's start and its end, and whether the end went wrong", () => {
  const started = { from: { botId: "one" }, tool: { name: "Started a side job: Count", ok: true }, threadRef: job };
  const failed = { from: { botId: "one" }, roomRequest: { phase: "result" }, tool: { name: "#Count — failed: timed out", ok: false }, threadRef: job };
  expect(oneChatRow(started, "one-main", bots)).toMatchObject({ kind: "sideJob", threadId: "one-job", title: "Count", ended: false });
  expect(oneChatRow(failed, "one-main", bots)).toMatchObject({ kind: "sideJob", ended: true, ok: false, name: "#Count — failed: timed out" });
});

it("leaves a row sent outside a room and an unknown bot's row as they are", () => {
  const direct = { from: { botId: "one" }, sentDirectly: { name: "Test Bot 3" }, tool: { name: "Sent" }, threadRef: work };
  const gone = { from: { botId: "one" }, tool: { name: "Sent" }, threadRef: { botId: "deleted", threadId: "x", title: "x" } };
  for (const row of [direct, gone]) expect(oneChatRow(row, "one-main", bots)).toBeNull();
});
