import { describe, expect, it } from "vitest";

import { sendNtfy } from "./personal-ntfy.ts";

const env = { OMB_NTFY_TOPIC: "omb-test", OMB_ONE_CHAT: "1" };
const done = { kind: "done", botId: "scout", botName: "Scout", threadId: "th_a/b", title: "Scout finished", body: "Daily digest:\n3 new leads." };

function recorder() {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("sendNtfy", () => {
  it("publishes the title, the text and a link to the chat", async () => {
    const { calls, fetchImpl } = recorder();
    await sendNtfy({ notification: done, phoneLive: () => false, env, fetchImpl });
    expect(calls).toEqual([{
      url: "https://ntfy.sh",
      body: { topic: "omb-test", title: "Scout finished", message: "Daily digest: 3 new leads.", click: "openmausbot://chat/th_a%2Fb", priority: 3 },
    }]);
  });

  it("raises the priority of an approval and clips long text to 200 characters", async () => {
    const { calls, fetchImpl } = recorder();
    await sendNtfy({ notification: { ...done, kind: "approval", body: "x".repeat(500) }, phoneLive: () => false, env, fetchImpl });
    const body = calls[0]?.body as { priority: number; message: string };
    expect(body.priority).toBe(4);
    expect([...body.message]).toHaveLength(200);
  });

  it("sends nothing while the phone is live, for other kinds, or with no topic or one chat", async () => {
    const { calls, fetchImpl } = recorder();
    await sendNtfy({ notification: done, phoneLive: () => true, env, fetchImpl });
    await sendNtfy({ notification: { ...done, kind: "mention" }, phoneLive: () => false, env, fetchImpl });
    await sendNtfy({ notification: done, phoneLive: () => false, env: { OMB_ONE_CHAT: "1" }, fetchImpl });
    await sendNtfy({ notification: done, phoneLive: () => false, env: { OMB_NTFY_TOPIC: "omb-test" }, fetchImpl });
    expect(calls).toEqual([]);
  });

  it("logs a failed publish instead of throwing", async () => {
    const lines: string[] = [];
    const fetchImpl = (async () => { throw new TypeError("offline"); }) as typeof fetch;
    await sendNtfy({ notification: done, phoneLive: () => false, env, fetchImpl, log: (line) => lines.push(line) });
    expect(lines).toEqual(["[ntfy] publish failed: TypeError"]);
  });
});
