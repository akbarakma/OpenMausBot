import { describe, expect, it } from "vitest";
import type { TaskUsage } from "@/state/store";
import { contextMeterReading, contextTokenRows } from "./context-meter";

const usage = (extra: Partial<TaskUsage> = {}): TaskUsage => ({ input: 0, output: 0, costUsd: null, turns: 1, ...extra });

describe("contextMeterReading", () => {
  it("has nothing to show before the provider reports context", () => {
    expect(contextMeterReading(undefined)).toBeNull();
    expect(contextMeterReading(usage())).toBeNull();
    expect(contextMeterReading(usage({ context: { tokens: 0, window: 200_000 } }))).toBeNull();
  });

  it("reads the share of the window and stays grey up to 90%", () => {
    expect(contextMeterReading(usage({ context: { tokens: 26_000, window: 200_000 } })))
      .toEqual({ tokens: 26_000, window: 200_000, percent: 13, fill: 13, danger: false });
    expect(contextMeterReading(usage({ context: { tokens: 180_000, window: 200_000 } }))?.danger).toBe(false);
  });

  it("turns red above 90% and never draws past a full ring", () => {
    expect(contextMeterReading(usage({ context: { tokens: 188_000, window: 200_000 } }))?.danger).toBe(true);
    expect(contextMeterReading(usage({ context: { tokens: 260_000, window: 200_000 } }))).toMatchObject({ percent: 130, fill: 100, danger: true });
  });

  it("shows tokens alone when the provider reports no window", () => {
    expect(contextMeterReading(usage({ context: { tokens: 26_000 } })))
      .toEqual({ tokens: 26_000, window: undefined, percent: undefined, fill: 0, danger: false });
  });
});

describe("contextTokenRows", () => {
  it("splits input into uncached and cached when the provider reports cache reads", () => {
    const rows = contextTokenRows(usage({
      input: 1_138_000, cachedInput: 1_100_000, output: 52_000,
      lastTurn: { input: 26_000, cachedInput: 24_800, output: 860, costUsd: null },
    }));
    expect(rows).toEqual([
      { key: "uncached", total: 38_000, last: 1_200 },
      { key: "cached", total: 1_100_000, last: 24_800 },
      { key: "output", total: 52_000, last: 860 },
    ]);
  });

  it("leaves the last message's split blank when only the totals know cache reads", () => {
    expect(contextTokenRows(usage({
      input: 1_138_000, cachedInput: 1_100_000, output: 52_000,
      lastTurn: { input: 800, output: 40, costUsd: null },
    }))).toEqual([
      { key: "uncached", total: 38_000, last: undefined },
      { key: "cached", total: 1_100_000, last: undefined },
      { key: "output", total: 52_000, last: 40 },
    ]);
  });

  it("shows one input row when cache reads are unknown, and no last column without a last turn", () => {
    expect(contextTokenRows(usage({ input: 40_000, output: 5_000 }))).toEqual([
      { key: "input", total: 40_000, last: undefined },
      { key: "output", total: 5_000, last: undefined },
    ]);
  });
});
