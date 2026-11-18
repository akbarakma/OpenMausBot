import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

import { launchVerificationServer, runControlOmb } from "../scripts/control-omb.ts";
import { SKILL_REVIEW_MARKER } from "./skill-review.ts";
import { removeTempDir } from "./testing/cleanup.ts";

const SKILL_MD = "---\nname: weekly-report\ndescription: Writes the weekly status report.\n---\n\n# Weekly report\n\n## Procedure\n1. Read notes/status.md.\n";

it("reviews a main chat only from its last review on, so a replaced rule does not come back", async () => {
  const folder = mkdtempSync(join(tmpdir(), "omb-one-chat-review-"));
  const routes = join(folder, "routes.json");
  const textLog = join(folder, "one-shot.jsonl");
  writeFileSync(routes, JSON.stringify({ [SKILL_REVIEW_MARKER]: JSON.stringify({ changes: [{ action: "create", skill_md: SKILL_MD, gist: "Weekly report." }] }) }));
  const fixture = await launchVerificationServer({
    ...process.env,
    FAKE_CLAUDE_TEXT_ROUTES: routes,
    FAKE_CLAUDE_TEXT_LOG: textLog,
    FAKE_CLAUDE_TOOL_CALLS: JSON.stringify([
      { name: "Read", input: { file_path: "notes/status.md" }, ok: true, output: "notes" },
      { name: "Grep", input: { pattern: "done" }, ok: true, output: "3 matches" },
    ]),
  }, undefined, undefined, undefined, undefined, { scripted: false, oneChat: true });
  const { url, dataDir } = fixture.info;
  const api = async (method: string, path: string, body?: unknown, expected = 200) => {
    const response = await fetch(url + path, {
      method, headers: { "content-type": "application/json", origin: url },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json() as any;
    expect(response.status, JSON.stringify(result)).toBe(expected);
    return result;
  };
  // SAFETY: the fake CLI appends exactly this shape, one object per line
  const reviews = (): string[] => (existsSync(textLog) ? readFileSync(textLog, "utf8").split("\n").filter(Boolean) : [])
    .map((line) => (JSON.parse(line) as { prompt: string }).prompt).filter((prompt) => prompt.includes(SKILL_REVIEW_MARKER));
  try {
    await api("PATCH", "/api/config", { features: { skillReview: true, skillReviewSteps: 3 } });
    const { bot } = await api("POST", "/api/bots", { name: "Scout" }, 201);
    const turn = async (text: string) => {
      await runControlOmb(["send", "--bot", bot.id, "--task", bot.threadId, "--text", text, "--url", url]);
      expect(await runControlOmb(["wait", "--bot", bot.id, "--task", bot.threadId, "--timeout", "30", "--url", url])).toMatchObject({ status: "settled" });
    };

    await turn("Reports go to the Results chat.");
    await turn("Write the weekly report.");
    await expect.poll(() => reviews().length, { timeout: 20_000 }).toBe(1);
    expect(reviews()[0]).toContain("Reports go to the Results chat.");
    await expect.poll(() => JSON.parse(readFileSync(join(dataDir, "skill-review.json"), "utf8")).counters[0].steps, { timeout: 5_000 }).toBe(0);

    await turn("Reports go to Main Chat now.");
    await turn("Write it again.");
    await expect.poll(() => reviews().length, { timeout: 20_000 }).toBe(2);
    expect(reviews()[1]).toContain("Reports go to Main Chat now.");
    expect(reviews()[1]).not.toContain("Reports go to the Results chat.");
  } finally {
    await fixture.close();
    await removeTempDir(folder);
  }
}, 120_000);
