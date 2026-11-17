import type { Bot, Group, Message, TaskUsage } from "@/state/store";
import { contextShare } from "./usage";

export const CONTEXT_WARNING_PERCENT = 80;

export function compactedSinceReading(messages: readonly Pick<Message, "role" | "kind">[]): boolean {
  const compaction = messages.findLastIndex((message) => message.kind === "compaction");
  if (compaction < 0) return false;
  const reply = messages.findLastIndex((message) => message.role === "bot" && message.kind === "text");
  return compaction > reply;
}

/** The header pill's reading, from 80% of a known window until the conversation is compacted. The message box's
 * context button keeps a reading for every thread, so the header stays quiet below that. */
export interface ThreadContextReading {
  tokens: number;
  window: number;
  percent: number;
}

export function threadContextWarning(usage: TaskUsage | undefined, messages: readonly Pick<Message, "role" | "kind">[]): ThreadContextReading | null {
  const share = usage ? contextShare(usage) : null;
  if (!share || share.window === undefined || share.percent === undefined || share.percent < CONTEXT_WARNING_PERCENT) return null;
  if (compactedSinceReading(messages)) return null;
  return { tokens: share.tokens, window: share.window, percent: share.percent };
}

/** Compacting a chat under half the point where it compacts on its own frees little, so the one-chat app offers it from there. */
export function compactOffered(usage: TaskUsage | undefined, messages: readonly Pick<Message, "role" | "kind">[]): boolean {
  const at = usage?.context?.compactAt;
  if (!at) return threadContextWarning(usage, messages) !== null;
  return (usage.context?.tokens ?? 0) >= at / 2 && !compactedSinceReading(messages);
}

export function roomContextWarnings(group: Pick<Group, "memberContext">, members: readonly Bot[]):
  Array<{ bot: Bot; tokens: number; percent: number; requested: boolean }> {
  return members.flatMap((bot) => {
    const reading = group.memberContext?.[bot.id];
    if (!reading || !(reading.window > 0)) return [];
    const percent = Math.min(999, Math.round((reading.tokens / reading.window) * 100));
    return percent >= CONTEXT_WARNING_PERCENT ? [{ bot, tokens: reading.tokens, percent, requested: reading.compactRequested === true }] : [];
  });
}
