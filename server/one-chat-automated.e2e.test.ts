import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

import { launchVerificationServer, runControlOmb } from "../scripts/control-omb.ts";
import { removeTempDir } from "./testing/cleanup.ts";

it("a wait that ran in the main chat leaves the person's later turns counted for skill review", async () => {
  const folder = mkdtempSync(join(tmpdir(), "omb-one-chat-automated-"));
  const gate = join(folder, "finish");
  const report = join(folder, "report.txt");
  const fixture = await launchVerificationServer(
    { ...process.env, FAKE_CLAUDE_MODE: "slow", FAKE_CLAUDE_SLOW_FINISH_GATE: gate, FAKE_CLAUDE_SLOW_TAIL_TOOL: "1" },
    undefined, undefined, undefined, undefined, { scripted: false, oneChat: true },
  );
  const { url, dataDir } = fixture.info;
  const api = async (method: string, path: string, body?: unknown, expected = 200, token?: string) => {
    const response = await fetch(url + path, {
      method, headers: { "content-type": "application/json", origin: url, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json() as any;
    expect(response.status, JSON.stringify(result)).toBe(expected);
    return result;
  };
  const turnToken = async () => {
    let token = "";
    await expect.poll(() => {
      try { token = JSON.parse(readFileSync(fixture.fixtureDumpPath, "utf8")).mcpConfig.mcpServers.agents.env.OMB_COMMS_TOKEN; } catch { return false; }
      return Boolean(token);
    }, { timeout: 15_000 }).toBe(true);
    return token;
  };
  try {
    await api("PATCH", "/api/config", { features: { skillReview: true, skillReviewSteps: 3 } });
    const { bot } = await api("POST", "/api/bots", { name: "Scout" }, 201);
    const busy = async () => (await api("GET", "/api/bots?messages=0")).bots.find((candidate: any) => candidate.id === bot.id).busy;
    const steps = (): number => {
      const file = join(dataDir, "skill-review.json");
      if (!existsSync(file)) return 0;
      return JSON.parse(readFileSync(file, "utf8")).counters.find((counter: any) => counter.botId === bot.id && counter.threadId === bot.threadId)?.steps ?? 0;
    };
    const send = (text: string) => runControlOmb(["send", "--bot", bot.id, "--task", bot.threadId, "--text", text, "--url", url]);

    await send("Tell me when the report is ready");
    const token = await turnToken();
    await api("POST", "/api/internal/waits", { label: "the report", kind: "file_exists", path: report, follow_up: "Say the report is ready." }, 201, token);
    writeFileSync(gate, "finish");
    await expect.poll(busy, { timeout: 15_000 }).toBe(false);
    const personTurn = steps();
    expect(personTurn).toBeGreaterThan(0);

    writeFileSync(report, "done");
    await expect.poll(() => {
      const runs = JSON.parse(readFileSync(join(dataDir, "routines.json"), "utf8")).runs as any[];
      return runs.some((run) => run.routineId.startsWith("wait:") && run.threadId === bot.threadId && run.status === "completed");
    }, { timeout: 40_000 }).toBe(true);
    await expect.poll(busy, { timeout: 15_000 }).toBe(false);
    expect(steps()).toBe(personTurn);

    await send("Thanks, now check the notes");
    await expect.poll(busy, { timeout: 15_000 }).toBe(false);
    await expect.poll(steps, { timeout: 5_000 }).toBe(personTurn * 2);
  } finally {
    await fixture.close();
    await removeTempDir(folder);
  }
}, 120_000);
