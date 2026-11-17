import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import type { InboxRow, InboxView } from "../shared/inbox.ts";
import { automationNames, automationOf, createInboxMutes, inboxMuteRoutes, INBOX_MUTES_FILE } from "./inbox-mutes.ts";
import { ONE_CHAT_ENV } from "./one-chat.ts";
import { PASS } from "./routes/table.ts";

const saved = process.env[ONE_CHAT_ENV];
let dir = "";
beforeEach(() => { process.env[ONE_CHAT_ENV] = "1"; dir = mkdtempSync(join(tmpdir(), "inbox-mutes-")); });
afterEach(() => {
  if (saved === undefined) delete process.env[ONE_CHAT_ENV]; else process.env[ONE_CHAT_ENV] = saved;
  rmSync(dir, { recursive: true, force: true });
});

const row = (id: string, kind: InboxRow["kind"], text: string, botId = "mira"): InboxRow =>
  ({ id, kind, tab: kind === "ask" ? "needs-you" : "info", from: { name: "Mira", botId }, text, at: 1, unread: true });

const names = automationNames({
  definitions: [[{ id: "receipts", name: "Stale pending receipt check", botId: "mira" }], [{ id: "gmail", name: "Gmail new-mail triage", botId: "mira" }]],
  runs: [{ routineId: "gmail", routineName: "Gmail triage", botId: "mira" }, { routineId: "maui-gmail", routineName: "Gmail new-mail triage", botId: "maui" }],
});

const view = (): InboxView => ({ botId: null, threadId: null, anchor: "r1", rows: [
  row("r1", "result", "Gmail new-mail triage: 🟡 Midtrans has maintenance on Nov 24"),
  row("r2", "result", "Gmail triage: an old report filed before the rename"),
  row("n1", "notice", "Gmail new-mail triage: the Gmail sign-in expired"),
  row("a1", "ask", "Gmail new-mail triage: Archive these 12 newsletters?"),
  row("r3", "result", "Stale pending receipt check: 2 receipts wait"),
  row("r4", "result", "Gmail new-mail triage: Maui's own report", "maui"),
  row("m1", "message", "Gmail new-mail triage: a message, not a report"),
] });

it("names a report by the automation of its own bot whose name its text starts with", () => {
  expect(automationOf(row("x", "result", "Gmail new-mail triage: hi"), names)).toEqual({ id: "gmail", name: "Gmail new-mail triage" });
  expect(automationOf(row("x", "result", "Gmail new-mail triage: hi", "maui"), names)).toEqual({ id: "maui-gmail", name: "Gmail new-mail triage" });
  expect(automationOf(row("x", "result", "Gmail new-mail triage hi"), names)).toBeUndefined();
  expect(automationOf(row("x", "message", "Gmail new-mail triage: hi"), names)).toBeUndefined();
});

it("leaves out a muted automation's reports, old names included, and keeps its questions and failures", () => {
  const mutes = createInboxMutes({ dataDir: dir, automations: () => names });
  expect(mutes.shape(view()).rows.map((one) => one.id)).toEqual(["r1", "r2", "n1", "a1", "r3", "r4", "m1"]);
  mutes.set("gmail", true);
  const shaped = mutes.shape(view());
  expect(shaped.rows.map((one) => one.id)).toEqual(["n1", "a1", "r3", "r4", "m1"]);
  expect(shaped.rows.find((one) => one.id === "n1")?.automation).toEqual({ id: "gmail", name: "Gmail new-mail triage" });
  expect(shaped.anchor).toBeNull();
  expect(shaped.mutedAutomations).toEqual(["gmail"]);

  expect(createInboxMutes({ dataDir: dir, automations: () => names }).muted()).toEqual(["gmail"]);
  mutes.set("gmail", false);
  expect(JSON.parse(readFileSync(join(dir, INBOX_MUTES_FILE), "utf8"))).toEqual({ version: 1, muted: [] });
  expect(mutes.shape(view()).rows).toHaveLength(7);
});

it("changes nothing with one chat off", () => {
  delete process.env[ONE_CHAT_ENV];
  const mutes = createInboxMutes({ dataDir: dir, automations: () => names });
  mutes.set("gmail", true);
  expect(mutes.shape(view())).toEqual(view());
});

it("lets only the owner mute, and answers with the inbox as it lists now", async () => {
  const mutes = createInboxMutes({ dataDir: dir, automations: () => names });
  const routes = inboxMuteRoutes(mutes, { owner: (auth) => auth.kind === "session", view: () => mutes.shape(view()) });
  const call = async (path: string, auth: any, method = "POST") => {
    let answer: { status: number; body: any } | null = null;
    const out = await routes({ res: {} as any, path, method, auth, json: ((_res: unknown, status: number, body: unknown) => { answer = { status, body }; }) as any } as any);
    return out === PASS ? "pass" : answer!;
  };
  expect(await call("/api/inbox/automations/gmail/mute", { kind: "loopback", trust: "service" })).toMatchObject({ status: 403 });
  expect(mutes.muted()).toEqual([]);
  const muted = await call("/api/inbox/automations/gmail/mute", { kind: "session" });
  expect(muted).toMatchObject({ status: 200, body: { mutedAutomations: ["gmail"] } });
  expect((muted as { body: InboxView }).body.rows.map((one) => one.id)).not.toContain("r1");
  expect(await call("/api/inbox/automations/gmail/unmute", { kind: "session" })).toMatchObject({ status: 200, body: { mutedAutomations: [] } });
  expect(await call("/api/inbox/automations/gmail/mute", { kind: "session" }, "GET")).toMatchObject({ status: 405 });
  expect(await call("/api/inbox/other", { kind: "session" })).toBe("pass");
});
