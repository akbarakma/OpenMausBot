import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { InboxRow, InboxView } from "../shared/inbox.ts";
import { writeFileAtomic } from "./atomic.ts";
import { oneChatOn } from "./one-chat.ts";
import type { RequestAuth } from "./request-auth.ts";
import { PASS, type RouteHandler } from "./routes/table.ts";

export const INBOX_MUTES_FILE = "inbox-mutes.json";
const MAX_MUTED = 500;

const fileSchema = z.object({ version: z.literal(1), muted: z.array(z.string().min(1).max(512)).max(MAX_MUTED) });

/** An automation as a report names it: a run's name at the time, or a routine's or webhook's current one. */
export interface AutomationName { id: string; name: string; botId: string }

type Named = { id: string; name: string; botId?: string };

/** Every name an automation's reports can start with: its runs' names cover a rename and an app event's trigger. */
export function automationNames(sources: { definitions: ReadonlyArray<readonly Named[]>; runs: ReadonlyArray<{ routineId: string; routineName: string; botId: string }> }): AutomationName[] {
  const names = new Map<string, AutomationName>();
  const add = (id: string, name: string, botId: string | undefined) => { if (botId && name) names.set(`${botId}\u0000${name}`, { id, name, botId }); };
  for (const run of sources.runs) add(run.routineId, run.routineName, run.botId);
  for (const list of sources.definitions) for (const one of list) add(one.id, one.name, one.botId);
  return [...names.values()];
}

/** Matches a report to its automation by the "<name>: " its text starts with; the longest name wins. */
export function automationOf(row: Pick<InboxRow, "kind" | "from" | "text">, names: readonly AutomationName[]): { id: string; name: string } | undefined {
  if ((row.kind !== "result" && row.kind !== "notice") || !row.from.botId) return undefined;
  let best: AutomationName | undefined;
  for (const one of names) {
    if (one.botId !== row.from.botId || !one.name || !row.text.startsWith(`${one.name}: `)) continue;
    if (!best || one.name.length > best.name.length) best = one;
  }
  return best ? { id: best.id, name: best.name } : undefined;
}

/** One chat's "Mute in Inbox": a muted automation's reports leave the list, old ones included. Its questions and
 * failures still show. */
export function createInboxMutes(deps: { dataDir: string; automations(): AutomationName[] }) {
  const file = join(deps.dataDir, INBOX_MUTES_FILE);
  let muted = new Set<string>();
  try {
    const parsed = fileSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (parsed.success) muted = new Set(parsed.data.muted);
    else console.warn(`inbox mutes: ${file} is not a mutes file; starting with none`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`inbox mutes: ${file} is unreadable; starting with none`);
  }

  function set(id: string, on: boolean): void {
    if (muted.has(id) === on) return;
    if (on) muted.add(id);
    else muted.delete(id);
    writeFileAtomic(file, `${JSON.stringify({ version: 1, muted: [...muted].slice(-MAX_MUTED) })}\n`, { mode: 0o600 });
  }

  function shape(view: InboxView): InboxView {
    if (!oneChatOn()) return view;
    const names = deps.automations();
    const rows: InboxRow[] = [];
    for (const row of view.rows) {
      const automation = automationOf(row, names);
      if (automation && row.kind === "result" && muted.has(automation.id)) continue;
      rows.push(automation ? { ...row, automation } : row);
    }
    return { ...view, rows, anchor: view.anchor && rows.some((row) => row.id === view.anchor) ? view.anchor : null, mutedAutomations: [...muted] };
  }

  return { shape, set, muted: () => [...muted] };
}

export type InboxMutes = ReturnType<typeof createInboxMutes>;

/** POST /api/inbox/automations/<id>/mute and /unmute, for the place's owner; each answers with the inbox as it lists now. */
export function inboxMuteRoutes(mutes: InboxMutes, deps: { owner(auth: RequestAuth): boolean; view(auth: RequestAuth): InboxView | null }): RouteHandler {
  return async ({ res, path, method, auth, json }) => {
    const m = /^\/api\/inbox\/automations\/([\w-]{1,512})\/(mute|unmute)$/.exec(path);
    if (!m || !oneChatOn()) return PASS;
    if (method !== "POST") return json(res, 405, { error: "method not allowed" });
    if (!deps.owner(auth)) return json(res, 403, { error: "Only this place's owner can mute an automation." });
    const before = deps.view(auth);
    if (!before) return json(res, 404, { error: "There is no inbox here." });
    try {
      mutes.set(m[1]!, m[2] === "mute");
    } catch (error) {
      return json(res, 500, { error: `The mute could not be saved: ${error instanceof Error ? error.message : String(error)}` });
    }
    return json(res, 200, deps.view(auth));
  };
}
