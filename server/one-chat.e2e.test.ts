import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { launchVerificationServer, runControlOmb } from "../scripts/control-omb.ts";
import { request } from "../scripts/mcp-server.ts";
import { oneChatRow } from "../src/lib/bot-exchange.ts";

const SETTLED = "Your downstream room requests have settled.";

it("keeps one chat per bot: a teammate's message, a side job and a webhook's run stay hidden and report into the main chat", async () => {
  const session = await launchVerificationServer(process.env, undefined, undefined, undefined, undefined, { scripted: true, oneChat: true });
  const cli = (...args: string[]) => runControlOmb(args, { env: { OPENMAUSBOT_URL: session.info.url } }) as Promise<any>;
  const api = (path: string, body?: unknown, method = "POST") =>
    request(path, body === undefined ? {} : { method, body: JSON.stringify(body) }, session.info.url) as Promise<any>;
  try {
    const kara = (await cli("new-bot", "--name", "Kara")).bot;
    const mira = (await cli("new-bot", "--name", "Mira")).bot;
    const planPath = join(session.info.dataDir, "room-plan.json");
    writeFileSync(planPath, JSON.stringify({
      [kara.id]: { script: [
        { key: "ASK-DONE", match: [SETTLED, "ASK-JOB"], reply: "ASK-DONE: Mira deleted it.", repeat: true },
        { key: "ASK", match: ["ASK-JOB"], steps: [{ arguments: { bot_ids: [mira.id], message: "PAIR-ASK: delete your hourly routine" } }], reply: "ASK: asked Mira.", repeat: true },
      ] },
      [mira.id]: { script: [
        { key: "PAIR", match: ["PAIR-ASK"], steps: [{ tool: "post_to_thread", arguments: { thread_id: "main", message: "PAIR-NOTE: Kara asked me to delete a routine." }, expectError: false }], reply: "PAIR: deleted the hourly routine.", repeat: true },
        { key: "SIDE-DONE", match: [SETTLED, "SIDE-JOB"], reply: "SIDE-DONE: ledger A balances." },
        { key: "SIDE-SELF", match: ["SIDE-SELF"], reply: "SIDE-SELF: ledger A balances." },
        { key: "SIDE", match: ["SIDE-JOB"], steps: [{ tool: "start_thread", arguments: { title: "Ledger A", message: "SIDE-SELF: check ledger A" }, expectError: false }], reply: "SIDE: started the check." },
        { key: "MAIL", match: ["Triage the new mail"], reply: "MAIL: one mail needs your reply.", repeat: true },
        { key: "RECEIPTS", match: ["Check the stale receipts"], reply: "Checked 3 receipts.\nNOTHING NEW", repeat: true },
      ] },
    }));
    const evidence = (): any[] => existsSync(`${planPath}.evidence.jsonl`)
      ? readFileSync(`${planPath}.evidence.jsonl`, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
    const ran = (...keys: string[]) => keys.every((key) => evidence().some((turn) => turn.planKey === key));
    const tasksOf = async (botId: string) => (await api("/api/bots")).bots.find((bot: any) => bot.id === botId).tasks as any[];
    const shown = async (botId: string) => (await tasksOf(botId)).filter((task) => !task.routineRunId).map((task) => task.title);
    const hidden = async (botId: string) => (await tasksOf(botId)).filter((task) => task.routineRunId?.startsWith("work:")).map((task) => task.title);
    const rows = async (threadId: string) => ((await api(`/api/threads/${threadId}/messages`)).messages as any[])
      .flatMap((message) => [message.tool?.name, message.tool?.output, message.text].filter(Boolean)) as string[];

    expect(await shown(kara.id)).toEqual(["Main Chat"]);
    expect(await shown(mira.id)).toEqual(["Main Chat"]);

    await cli("send", "--bot", kara.id, "--task", kara.activeTaskId, "--text", "ASK-JOB: have Mira delete her hourly routine");
    await expect.poll(() => ran("ASK", "PAIR", "ASK-DONE"), { timeout: 30_000 }).toBe(true);
    expect(await shown(mira.id)).toEqual(["Main Chat"]);
    expect(await hidden(mira.id)).toEqual(["@Kara · work"]);
    expect(await shown(kara.id)).toEqual(["Main Chat"]);
    const miraMain = await rows(mira.activeTaskId);
    expect(miraMain).toContain("Message from Kara: PAIR-ASK: delete your hourly routine");
    expect(miraMain).toContain("Replied to Kara: PAIR: deleted the hourly routine.");
    const note = ((await api(`/api/threads/${mira.activeTaskId}/messages`)).messages as any[]).find((message) => message.threadPost);
    expect(note).toMatchObject({ role: "bot", kind: "text", text: "PAIR-NOTE: Kara asked me to delete a routine." });

    await cli("send", "--bot", kara.id, "--task", kara.activeTaskId, "--text", "ASK-JOB: ask Mira once more");
    await expect.poll(() => evidence().filter((turn) => turn.planKey === "ASK-DONE").length, { timeout: 30_000 }).toBe(2);
    expect(await hidden(mira.id)).toEqual(["@Kara · work"]);
    expect((await rows(mira.activeTaskId)).filter((row) => row.startsWith("Message from Kara"))).toHaveLength(2);

    await cli("send", "--bot", mira.id, "--task", mira.activeTaskId, "--text", "SIDE-JOB: check ledger A on the side");
    await expect.poll(() => ran("SIDE", "SIDE-SELF", "SIDE-DONE"), { timeout: 30_000 }).toBe(true);
    expect(await shown(mira.id)).toEqual(["Main Chat"]);
    expect((await hidden(mira.id)).sort()).toEqual(["@Kara · work", "Ledger A"]);
    const afterJob = await rows(mira.activeTaskId);
    expect(afterJob.join("\n")).toContain("SIDE-DONE: ledger A balances.");
    expect(afterJob).toEqual(expect.arrayContaining(["Started a side job: Ledger A", "Side job finished: Ledger A"]));

    const exchange = (await api(`/api/bots/${kara.id}/exchange/${mira.id}`)).lines as any[];
    expect(exchange.map((line) => [line.botId === kara.id ? "Kara" : "Mira", line.text])).toEqual([
      ["Kara", "PAIR-ASK: delete your hourly routine"], ["Mira", "PAIR: deleted the hourly routine."],
      ["Kara", "PAIR-ASK: delete your hourly routine"], ["Mira", "PAIR: deleted the hourly routine."],
    ]);
    expect((await api(`/api/bots/${mira.id}/exchange/${kara.id}`)).lines).toEqual(exchange);
    const bots = (await api("/api/bots")).bots as any[];
    const lines = async (bot: any) => ((await api(`/api/threads/${bot.activeTaskId}/messages`)).messages as any[])
      .flatMap((message) => { const row = oneChatRow(message, bot.activeTaskId, bots.map((each) => ({ ...each, threadId: each.activeTaskId }))); return row ? [row] : []; });
    const exchangeRow = (ownId: string, peerId: string, sent: boolean) => ({ kind: "exchange", ownId, peerId, sent });
    expect(await lines(kara)).toEqual([...Array(2)].flatMap(() => [exchangeRow(kara.id, mira.id, true), exchangeRow(kara.id, mira.id, false)]));
    const miraRows = await lines(mira);
    expect(miraRows.filter((row) => row.kind === "exchange")).toEqual([...Array(2)].flatMap(() => [exchangeRow(mira.id, kara.id, false), exchangeRow(mira.id, kara.id, true)]));
    expect(miraRows.filter((row) => row.kind === "sideJob").map((row: any) => [row.title, row.ended, row.ok])).toEqual([["Ledger A", false, true], ["Ledger A", true, true]]);

    const { webhook, credential } = await api("/api/webhooks", { name: "Gmail new-mail triage", prompt: "Triage the new mail.", botId: mira.id });
    const fired = await fetch(credential.url, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "mail-1" }, body: JSON.stringify({ from: "ada@example.test" }) });
    expect(fired.status).toBe(202);
    const { runId } = await fired.json() as { runId: string };
    const run = async () => ((await api("/api/routines")).runs as any[]).find((candidate) => candidate.id === runId);
    await expect.poll(async () => (await run())?.report?.state, { timeout: 30_000 }).toBe("posted");
    expect(await run()).toMatchObject({ webhookId: webhook.id, resultsThreadId: mira.activeTaskId });
    expect(await shown(mira.id)).toEqual(["Main Chat"]);
    const reports = ((await api(`/api/threads/${mira.activeTaskId}/messages`)).messages as any[]).filter((message) => message.automation);
    expect(reports).toEqual([expect.objectContaining({ text: "MAIL: one mail needs your reply.", automation: expect.objectContaining({ trigger: "webhook", name: "Gmail new-mail triage" }) })]);
    expect((await tasksOf(mira.id)).find((task) => task.threadId === mira.activeTaskId)?.unread, "a report the Inbox lists dots its bot").toBe(true);
    const mailRows = async () => ((await api("/api/inbox")).rows as any[]).filter((row) => row.automation?.id === webhook.id);
    await expect.poll(async () => (await mailRows()).map((row) => [row.kind, row.automation.name]), { timeout: 10_000 }).toEqual([["result", "Gmail new-mail triage"]]);
    const counted = (await api("/api/inbox/count")).count as number;
    expect((await api(`/api/inbox/automations/${webhook.id}/mute`, {})).mutedAutomations).toEqual([webhook.id]);
    expect(await mailRows(), "muted: its report leaves the Inbox").toEqual([]);
    expect((await api("/api/inbox/count")).count).toBe(counted - 1);
    expect(((await api(`/api/threads/${mira.activeTaskId}/messages`)).messages as any[]).filter((message) => message.automation?.name === "Gmail new-mail triage"), "Main Chat keeps it").toHaveLength(1);
    expect((await api(`/api/inbox/automations/${webhook.id}/unmute`, {})).mutedAutomations).toEqual([]);
    expect(await mailRows()).toHaveLength(1);

    const receipts = await api("/api/webhooks", { name: "Stale receipt check", prompt: "Check the stale receipts.", botId: mira.id });
    const quietFire = await fetch(receipts.credential.url, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "receipts-1" }, body: "{}" });
    const quietRunId = (await quietFire.json() as { runId: string }).runId;
    await expect.poll(async () => ((await api("/api/routines")).runs as any[]).find((candidate) => candidate.id === quietRunId)?.report?.state, { timeout: 30_000 }).toBe("quiet");
    const quiet = ((await api(`/api/threads/${mira.activeTaskId}/messages`)).messages as any[]).filter((message) => message.automation?.runId === quietRunId);
    expect(quiet).toEqual([expect.objectContaining({ role: "bot", kind: "text", text: "Nothing new", automation: expect.objectContaining({ quiet: true, name: "Stale receipt check" }) })]);
    expect(evidence().some((turn) => turn.planKey === undefined)).toBe(false);
  } finally {
    await session.close();
  }
}, 120_000);

it("keeps a Bot API chat hidden, also after the caller writes in it again", async () => {
  const session = await launchVerificationServer({ ...process.env, FAKE_CLAUDE_VERSION: "2.1.284" }, undefined, undefined, undefined, undefined, { scripted: false, oneChat: true });
  const { url } = session.info;
  const app = async (method: string, path: string, body?: unknown) => (await fetch(url + path, {
    method, headers: { "content-type": "application/json", origin: url }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })).json() as Promise<any>;
  try {
    const bot = (await runControlOmb(["new-bot", "--name", "Scout", "--url", url]) as any).bot;
    const on = await app("POST", `/api/bots/${bot.id}/bot-api`, { enabled: true });
    const call = async (body: unknown) => (await fetch(on.url, { method: "POST", headers: { authorization: `Bearer ${on.key}`, "content-type": "application/json" }, body: JSON.stringify(body) })).json() as Promise<any>;
    const first = await call({ message: "Hello from outside" });
    expect(first.reply).toBe("hello from fake claude");
    await call({ message: "And again", thread: first.thread });
    const tasks = (await app("GET", "/api/bots")).bots.find((candidate: any) => candidate.id === bot.id).tasks as any[];
    expect(tasks.filter((task) => !task.routineRunId).map((task) => task.title)).toEqual(["Main Chat"]);
    expect(tasks.find((task) => task.threadId === first.thread)).toMatchObject({ botApi: true, routineRunId: `work:${first.thread}` });
  } finally {
    await session.close();
  }
}, 120_000);
