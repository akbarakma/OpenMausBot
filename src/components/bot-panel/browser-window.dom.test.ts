// @vitest-environment happy-dom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { browserWindowClosed, HOLD_GRACE_MS, useHoldGrace } from "./browser-window";

let root: Root;
let shown: boolean[] = [];
const Probe = ({ botId }: { botId: string }) => {
  const grace = useHoldGrace(botId);
  useLayoutEffect(() => { shown.push(grace); });
  return null;
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  shown = [];
  root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe, { botId: "scout" })));
});
afterEach(() => {
  act(() => root.unmount());
  browserWindowClosed("scout", false);
  vi.useRealTimers();
});

describe("the hold left when the full browser closes", () => {
  it("keeps the card away for the server's two-minute grace when the person still held the browser", () => {
    act(() => browserWindowClosed("scout", true));
    expect(shown.at(-1)).toBe(true);
    act(() => { vi.advanceTimersByTime(HOLD_GRACE_MS - 1); });
    expect(shown.at(-1)).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(shown.at(-1)).toBe(false);
  });

  it("lets the card back at once when the browser was handed back, or held for another bot", () => {
    act(() => browserWindowClosed("pepper", true));
    expect(shown.at(-1)).toBe(false);
    act(() => browserWindowClosed("scout", true));
    act(() => browserWindowClosed("scout", false));
    expect(shown.at(-1)).toBe(false);
    browserWindowClosed("pepper", false);
  });
});
