// @vitest-environment happy-dom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppState, Bot } from "@/state/store";
import { BROWSING_HOLD_MS, noteBrowsing, useBrowsingHeld, useSimpleSidePanel } from "./simple-side-panel";

let root: Root;
let shown: boolean[] = [];
const Probe = ({ bot, browsing }: { bot: string; browsing: boolean }) => {
  const held = useBrowsingHeld(bot, browsing);
  useLayoutEffect(() => { shown.push(held); });
  return null;
};
let bot = "";
const render = (browsing: boolean) => act(() => root.render(createElement(Probe, { bot, browsing })));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  shown = [];
  bot = `bot-${Math.random()}`;
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe("the browser card's hold after browsing", () => {
  it("stays hidden for a turn that never browses", () => {
    render(false);
    act(() => { vi.advanceTimersByTime(BROWSING_HOLD_MS); });
    expect(shown.every((value) => !value)).toBe(true);
  });

  it("keeps the page up for five minutes after browsing ends, with no render in between that drops it, then hides it", () => {
    render(true);
    render(false);
    expect(shown).not.toContain(false);
    act(() => { vi.advanceTimersByTime(BROWSING_HOLD_MS - 1); });
    expect(shown.at(-1)).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(shown.at(-1)).toBe(false);
  });

  it("starts the five minutes again when the bot browses during them", () => {
    render(true);
    render(false);
    act(() => { vi.advanceTimersByTime(BROWSING_HOLD_MS - 1_000); });
    render(true);
    render(false);
    act(() => { vi.advanceTimersByTime(BROWSING_HOLD_MS - 1); });
    expect(shown.at(-1)).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(shown.at(-1)).toBe(false);
  });

  it("keeps the rest of the five minutes when the card unmounts and comes back, as a panel page or a closed panel does", () => {
    render(true);
    render(false);
    act(() => root.unmount());
    act(() => { vi.advanceTimersByTime(60_000); });
    root = createRoot(document.createElement("div"));
    render(false);
    expect(shown.at(-1)).toBe(true);
    act(() => { vi.advanceTimersByTime(BROWSING_HOLD_MS - 60_001); });
    expect(shown.at(-1)).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(shown.at(-1)).toBe(false);
  });

  it("counts the five minutes from when browsing stopped, even while the card was away", () => {
    render(true);
    act(() => root.unmount());
    act(() => { vi.advanceTimersByTime(1_000); });
    noteBrowsing(bot, false);
    act(() => { vi.advanceTimersByTime(BROWSING_HOLD_MS); });
    root = createRoot(document.createElement("div"));
    render(false);
    expect(shown.at(-1)).toBe(false);
  });

  it("has the side panel note when a bot that is not on screen stops browsing", () => {
    const browser = { id: "m", role: "bot", kind: "activity", at: 120, tool: { name: "mcp__browser__navigate" } } as Bot["messages"][number];
    const state = (busy: boolean) => ({ bots: [{ id: bot, threadId: "t", busy, turnStartedAt: 100, messages: [browser] }] }) as unknown as AppState;
    const Panel = ({ busy }: { busy: boolean }) => {
      useSimpleSidePanel({ active: false, bot: undefined, state: state(busy), dispatch: () => undefined, inline: true, covered: false });
      return null;
    };
    render(true);
    act(() => root.unmount());
    const side = createRoot(document.createElement("div"));
    act(() => side.render(createElement(Panel, { busy: true })));
    act(() => { vi.advanceTimersByTime(1_000); });
    act(() => side.render(createElement(Panel, { busy: false })));
    act(() => { vi.advanceTimersByTime(BROWSING_HOLD_MS); });
    root = createRoot(document.createElement("div"));
    render(false);
    expect(shown.at(-1)).toBe(false);
    act(() => side.unmount());
  });
});
