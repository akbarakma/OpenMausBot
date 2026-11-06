import type { TaskUsage } from "@/state/store";
import { cachedInput, cachedKnown, contextShare, hasFiniteCost, uncachedInput } from "./usage";

export const CONTEXT_METER_DANGER_PERCENT = 90;

export interface ContextMeterReading {
  tokens: number;
  window?: number;
  percent?: number;
  fill: number;
  danger: boolean;
}

export function contextMeterReading(usage: TaskUsage | undefined): ContextMeterReading | null {
  const share = usage ? contextShare(usage) : null;
  if (!share) return null;
  const percent = share.percent;
  return {
    tokens: share.tokens,
    window: share.window,
    percent,
    fill: Math.min(100, percent ?? 0),
    danger: percent !== undefined && percent > CONTEXT_METER_DANGER_PERCENT,
  };
}

export type TokenRowKey = "uncached" | "cached" | "input" | "output";
export interface TokenRow {
  key: TokenRowKey;
  total: number;
  last?: number;
}

export function contextTokenRows(usage: TaskUsage): TokenRow[] {
  const last = usage.lastTurn && hasFiniteCost(usage.lastTurn.input) ? usage.lastTurn : undefined;
  const input: TokenRow[] = cachedKnown(usage)
    ? [
      { key: "uncached", total: uncachedInput(usage), last: last && cachedKnown(last) ? uncachedInput(last) : undefined },
      { key: "cached", total: cachedInput(usage), last: last && cachedKnown(last) ? cachedInput(last) : undefined },
    ]
    : [{ key: "input", total: usage.input, last: last?.input }];
  return [...input, { key: "output", total: usage.output, last: last?.output }];
}
