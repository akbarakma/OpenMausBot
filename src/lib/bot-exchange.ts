import { useSyncExternalStore } from "react";
import { ONE_CHAT } from "./one-chat.ts";

export interface ExchangeRow {
  ownId: string;
  peerId: string;
  sent: boolean;
}

export interface ExchangeLine {
  id: string;
  at: number;
  botId: string;
  text: string;
  status?: "working" | "failed" | "cancelled";
}

export type OneChatRow = ({ kind: "exchange" } & ExchangeRow)
  | { kind: "sideJob"; ownId: string; threadId: string; title: string; ended: boolean; ok: boolean; name: string };

type RowMessage = {
  threadRef?: { botId: string; threadId: string; title: string };
  from?: { botId: string };
  roomRequest?: { phase: string };
  sentDirectly?: unknown;
  tool?: { name: string; ok?: boolean };
};
type RowBot = { id: string; threadId: string; tasks?: Array<{ threadId: string; openedBy?: { botId?: string } }> };

// The asking bot's chat has upstream's sent and result rows, which name the other bot's thread. The answering bot's chat has
// the server's "Message from" and "Replied to" rows, which name its own hidden thread, opened by the asking bot. A side job's
// rows name a hidden thread the bot opened itself.
export function oneChatRow(message: RowMessage, threadId: string | undefined, bots: readonly RowBot[]): OneChatRow | null {
  const ref = message.threadRef;
  if (!ONE_CHAT || !ref || !threadId || message.sentDirectly) return null;
  const own = bots.find((bot) => bot.threadId === threadId || bot.tasks?.some((task) => task.threadId === threadId));
  if (!own) return null;
  if (ref.botId === own.id) {
    const opener = own.tasks?.find((task) => task.threadId === ref.threadId)?.openedBy?.botId;
    if (opener === own.id) return { kind: "sideJob", ownId: own.id, threadId: ref.threadId, title: ref.title,
      ended: message.roomRequest?.phase === "result", ok: message.tool?.ok !== false, name: message.tool?.name ?? "" };
    if (!opener || !bots.some((bot) => bot.id === opener)) return null;
    return { kind: "exchange", ownId: own.id, peerId: opener, sent: Boolean(message.tool?.name.startsWith("Replied to ")) };
  }
  if (!bots.some((bot) => bot.id === ref.botId)) return null;
  if (message.roomRequest?.phase === "result") return { kind: "exchange", ownId: own.id, peerId: ref.botId, sent: false };
  return message.from?.botId === own.id ? { kind: "exchange", ownId: own.id, peerId: ref.botId, sent: true } : null;
}

let shown: { a: string; b: string } | null = null;
const listeners = new Set<() => void>();
const set = (next: typeof shown) => { shown = next; for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const openExchange = (a: string, b: string) => set({ a, b });
export const closeExchange = () => { if (shown) set(null); };
export const useShownExchange = () => useSyncExternalStore(subscribe, () => shown);
