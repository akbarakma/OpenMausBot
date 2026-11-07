// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PAUSED = "data-unfocused-paused";
let focused = true;

const animation = (target: Element, iterations: number) =>
  ({ animationName: "spin", effect: { target, getComputedTiming: () => ({ iterations }) } }) as unknown as Animation;
const animations = (target: Document | Element, list: () => Animation[]) =>
  Object.defineProperty(target, "getAnimations", { configurable: true, value: list });

beforeEach(() => {
  vi.resetModules();
  focused = true;
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("pauseLoopsWhileUnfocused", () => {
  it("pauses only endless animations while the window is unfocused, also ones that start then, and resumes them on focus", async () => {
    const { pauseLoopsWhileUnfocused } = await import("./window-focus");
    const loop = document.createElement("span");
    const once = document.createElement("span");
    const late = document.createElement("span");
    document.body.append(loop, once, late);
    animations(document, () => [animation(loop, Infinity), animation(once, 1)]);
    animations(late, () => [animation(late, Infinity)]);
    const stop = pauseLoopsWhileUnfocused();
    expect(loop.hasAttribute(PAUSED)).toBe(false);

    focused = false;
    window.dispatchEvent(new Event("blur"));
    await new Promise((done) => setTimeout(done, 0));
    expect(loop.hasAttribute(PAUSED)).toBe(true);
    expect(once.hasAttribute(PAUSED)).toBe(false);
    late.dispatchEvent(new Event("animationstart", { bubbles: true }));
    expect(late.hasAttribute(PAUSED)).toBe(true);

    focused = true;
    window.dispatchEvent(new Event("focus"));
    expect(document.querySelectorAll(`[${PAUSED}]`)).toHaveLength(0);
    stop();
  });

  it("follows the app window's own focus, which the page cannot read after a reload", async () => {
    let push: (focused: boolean) => void = () => undefined;
    const controls = { state: () => Promise.resolve({ maximized: false, focused: false }), onFocusChanged: (cb: (focused: boolean) => void) => { push = cb; return () => undefined; } };
    Object.defineProperty(window, "ogb", { configurable: true, value: { windowControls: controls } });
    try {
      const { windowFocused } = await import("./window-focus");
      expect(windowFocused()).toBe(true);
      await Promise.resolve();
      expect(windowFocused()).toBe(false);
      push(true);
      expect(windowFocused()).toBe(true);
      window.dispatchEvent(new Event("blur"));
      await new Promise((done) => setTimeout(done, 0));
      expect(windowFocused()).toBe(true);
    } finally {
      Reflect.deleteProperty(window, "ogb");
    }
  });

  it("stays focused while focus moves into one of the window's iframes", async () => {
    const { windowFocused } = await import("./window-focus");
    expect(windowFocused()).toBe(true);
    window.dispatchEvent(new Event("blur"));
    await new Promise((done) => setTimeout(done, 0));
    expect(windowFocused()).toBe(true);
  });
});
