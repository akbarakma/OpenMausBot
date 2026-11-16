import type { HandoffView } from "./coordinator.ts";

export interface ExchangeLine {
  id: string;
  at: number;
  botId: string;
  text: string;
  status?: "working" | "failed" | "cancelled";
}

const MAX_LINES = 200;

// A bot's job on itself, a room's hand-offs and a person's requests are left out: only bot asks bot counts.
export function botExchange(nodes: readonly HandoffView[], a: string, b: string, redact: (text: string) => string): ExchangeLine[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const pair = new Set([a, b]);
  const lines = nodes.flatMap((node): ExchangeLine[] => {
    const asker = node.parentId ? byId.get(node.parentId)?.botId : undefined;
    if (!asker || asker === node.botId || node.groupId || !pair.has(asker) || !pair.has(node.botId)) return [];
    const ask: ExchangeLine = { id: `${node.id}:ask`, at: node.createdAt, botId: asker, text: redact(node.text.trim()) };
    const reply: ExchangeLine = { id: `${node.id}:reply`, at: node.lastProgressAt ?? node.createdAt, botId: node.botId, text: redact(node.result.trim()) };
    if (node.status === "completed") return reply.text ? [ask, reply] : [ask];
    return [ask, { ...reply, status: node.status === "failed" || node.status === "cancelled" ? node.status : "working" }];
  });
  return lines.sort((x, y) => x.at - y.at).slice(-MAX_LINES);
}

// shortcut: reads every recorded hand-off per call (hundreds on bb-1), index them by pair if that reaches tens of thousands.
export function exchangeRoute(path: string, method: string, deps: {
  bot: (id: string) => unknown; nodes: () => readonly HandoffView[]; redact: (text: string) => string;
}): { status: number; body: unknown } | null {
  const m = method === "GET" ? /^\/api\/bots\/([\w-]+)\/exchange\/([\w-]+)$/.exec(path) : null;
  if (!m) return null;
  const a = m[1]!, b = m[2]!;
  if (a === b || !deps.bot(a) || !deps.bot(b)) return { status: 404, body: { error: "no such bot" } };
  return { status: 200, body: { lines: botExchange(deps.nodes(), a, b, deps.redact) } };
}
