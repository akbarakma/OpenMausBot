import { describe, expect, it } from "vitest";
import type { AppState } from "@/state/store";
import { inboxAttentionEntries } from "./InboxActive";

const bot = (id: string, tasks: Array<Record<string, unknown>>) =>
  ({ id, name: id, hidden: false, threadId: `${id}-main`, tasks } as unknown as AppState["bots"][number]);
const state = (bots: AppState["bots"]) =>
  ({ bots, pendingQueued: {}, groups: [] } as unknown as Pick<AppState, "bots" | "pendingQueued" | "groups">);
const view = { botId: null, threadId: null, rows: [], anchor: null } as never;

describe("Active Threads with one chat per bot", () => {
  it("leaves out a Main Chat that is only unread, and keeps one at work", () => {
    const bots = [
      bot("mira", [{ threadId: "mira-main", title: "Main Chat", createdAt: 1, updatedAt: 2, unread: true }]),
      bot("frosty", [{ threadId: "frosty-main", title: "Main Chat", createdAt: 1, updatedAt: 2, busy: true }]),
    ];
    expect(inboxAttentionEntries(state(bots), view).map((entry) => entry.task.threadId)).toEqual(["frosty-main"]);
  });
});
