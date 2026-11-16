import { expect, it } from "vitest";
import { exchangeRow } from "./bot-exchange";

const asker = { id: "one", threadId: "one-main", tasks: [{ threadId: "one-main" }, { threadId: "one-job", openedBy: { botId: "one" } }] };
const answerer = { id: "three", threadId: "three-main", tasks: [{ threadId: "three-main" }, { threadId: "three-work", openedBy: { botId: "one" } }] };
const bots = [asker, answerer];

it("names the other bot on both sides of an exchange, and which way the message went", () => {
  const sent = { from: { botId: "one" }, tool: { name: "Sent to Test Bot 3" }, threadRef: { botId: "three", threadId: "three-work" } };
  const result = { from: { botId: "three" }, roomRequest: { phase: "result" }, tool: { name: "Test Bot 3 replied" }, threadRef: { botId: "three", threadId: "three-work" } };
  const asked = { tool: { name: "Message from Test Bot 1: what code word?" }, threadRef: { botId: "three", threadId: "three-work" } };
  const replied = { tool: { name: "Replied to Test Bot 1: PLUMERIA-42" }, threadRef: { botId: "three", threadId: "three-work" } };
  expect(exchangeRow(sent, "one-main", bots)).toEqual({ ownId: "one", peerId: "three", sent: true });
  expect(exchangeRow(result, "one-main", bots)).toEqual({ ownId: "one", peerId: "three", sent: false });
  expect(exchangeRow(asked, "three-main", bots)).toEqual({ ownId: "three", peerId: "one", sent: false });
  expect(exchangeRow(replied, "three-main", bots)).toEqual({ ownId: "three", peerId: "one", sent: true });
});

it("leaves a side job, a row sent outside a room and an unknown bot's row as they are", () => {
  const sideJob = { from: { botId: "one" }, tool: { name: "Started a side job: Count" }, threadRef: { botId: "one", threadId: "one-job" } };
  const sideJobDone = { from: { botId: "one" }, roomRequest: { phase: "result" }, tool: { name: "Side job finished: Count" }, threadRef: { botId: "one", threadId: "one-job" } };
  const direct = { from: { botId: "one" }, sentDirectly: { name: "Test Bot 3" }, tool: { name: "Sent" }, threadRef: { botId: "three", threadId: "three-work" } };
  const gone = { from: { botId: "one" }, tool: { name: "Sent" }, threadRef: { botId: "deleted", threadId: "x" } };
  for (const row of [sideJob, sideJobDone, direct, gone]) expect(exchangeRow(row, "one-main", bots)).toBeNull();
});
