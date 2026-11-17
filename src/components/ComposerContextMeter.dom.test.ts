// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot, Message, TaskUsage } from "@/state/store";

const fixture = vi.hoisted(() => ({ api: vi.fn(), resized: [] as Array<() => void>, oneChat: false }));
vi.mock("@/lib/one-chat", () => ({ get ONE_CHAT() { return fixture.oneChat; }, hiddenWork: () => false }));
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return {
    ...original,
    api: (...args: unknown[]) => fixture.api(...args),
    useStore: () => ({ state: original.initialState, dispatch: vi.fn() }),
  };
});

const { ComposerContextMeter } = await import("./ComposerContextMeter");

const reply = { id: "m1", role: "bot", kind: "text", text: "Done.", at: 1 } as Message;
const botWith = (usage: TaskUsage | undefined, extra: Partial<Bot> = {}): Bot => ({
  id: "maus", name: "Maus", threadId: "t1", messages: [reply],
  tasks: [{ threadId: "t1", title: "Q4", createdAt: 1, updatedAt: 1, usage }],
  ...extra,
} as Bot);
const usage = (tokens: number, extra: Partial<TaskUsage> = {}): TaskUsage =>
  ({ input: 1_138_000, cachedInput: 1_100_000, output: 52_000, costUsd: 21.11, turns: 42, context: { tokens, window: 200_000 }, ...extra });

let host: HTMLDivElement;
let root: Root;
const render = (bot: Bot) => flushSync(() => root.render(createElement(ComposerContextMeter, { bot })));
const ring = () => host.querySelector<HTMLButtonElement>("[data-composer-context]");
const card = () => document.querySelector<HTMLElement>("[data-composer-context-card]");
const hover = () => {
  flushSync(() => ring()!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
  flushSync(() => ring()!.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" })));
  flushSync(() => vi.advanceTimersByTime(150));
};

beforeEach(() => {
  vi.useFakeTimers();
  fixture.resized = [];
  fixture.oneChat = false;
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: () => void) {}
    observe() { fixture.resized.push(this.callback); }
    disconnect() { fixture.resized = fixture.resized.filter((callback) => callback !== this.callback); }
  });
  fixture.api.mockReset().mockResolvedValue({});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ComposerContextMeter", () => {
  it("stays out of the composer until the provider reports context", () => {
    render(botWith(undefined));
    expect(ring()).toBeNull();
    render(botWith({ input: 0, output: 0, costUsd: null, turns: 0 }));
    expect(ring()).toBeNull();
  });

  it("opens a card with the reading, its bar and the token table on hover", () => {
    render(botWith(usage(26_000, { lastTurn: { input: 26_000, cachedInput: 24_800, output: 860, costUsd: null } })));
    expect(ring()!.getAttribute("aria-label")).toBe("13% context used");
    expect(card()).toBeNull();
    hover();
    expect(card()!.textContent).toMatch(/^Context13% · 26k \/ 200k/);
    expect(card()!.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("13");
    const rows = [...card()!.querySelectorAll("tbody tr")].map((row) => [...row.children].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ["Uncached input", "38k", "1.2k"],
      ["Cached input", "1.1M", "24.8k"],
      ["Output", "52k", "860"],
    ]);
  });

  it("in the one-chat app shows tokens with no percent, marks where compaction starts, and always offers Compact now", () => {
    fixture.oneChat = true;
    render(botWith(usage(26_000, { context: { tokens: 26_000, window: 200_000, compactAt: 160_000 } })));
    expect(ring()!.getAttribute("aria-label")).toBe("26k context used");
    hover();
    expect(card()!.textContent).toMatch(/^Context26k \/ 200k/);
    expect(card()!.textContent).not.toContain("%");
    expect(card()!.querySelector<HTMLElement>("[data-compact-tick]")!.style.left).toBe("80%");
    expect(card()!.querySelector("[data-compact-tick]")!.parentElement!.getAttribute("title")).toBe("Compacts on its own at 160k");
    expect([...card()!.querySelectorAll("button")].some((button) => button.textContent === "Compact now")).toBe(true);
    render(botWith(usage(26_000)));
    expect(card()!.querySelector("[data-compact-tick]")).toBeNull();
  });

  it("offers Compact now from 80% and posts to the bot's compact route", () => {
    render(botWith(usage(176_000)));
    hover();
    const compact = [...card()!.querySelectorAll("button")].find((button) => button.textContent === "Compact now")!;
    flushSync(() => compact.click());
    expect(fixture.api).toHaveBeenCalledWith("/api/bots/maus/compact", { method: "POST", body: JSON.stringify({ threadId: "t1" }) });
  });

  it("keeps Compact now away below 80% and disables it while the bot works", () => {
    render(botWith(usage(120_000)));
    hover();
    expect(card()!.querySelector("button")).toBeNull();
    render(botWith(usage(176_000), { busy: true }));
    expect(card()!.querySelector("button")!.disabled).toBe(true);
  });

  it("moves the card up when Compact now appears while it is pinned open", () => {
    const triggerTop = 500, gap = 14;
    let height = 80;
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.matches("[data-composer-context-card]") ? height : 0;
    });
    render(botWith(usage(120_000)));
    vi.spyOn(ring()!, "getBoundingClientRect").mockReturnValue({ top: triggerTop, bottom: triggerTop + 28, left: 900, right: 928 } as DOMRect);
    flushSync(() => ring()!.click());
    expect(card()!.style.top).toBe(`${triggerTop - gap - 80}px`);
    height = 120;
    render(botWith(usage(176_000)));
    flushSync(() => fixture.resized.forEach((callback) => callback()));
    expect(card()!.style.top).toBe(`${triggerTop - gap - 120}px`);
  });

  it("takes keyboard focus into the card and gives it back to the ring on Escape", () => {
    render(botWith(usage(176_000)));
    ring()!.focus();
    flushSync(() => ring()!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
    flushSync(() => vi.advanceTimersByTime(0));
    expect(document.activeElement?.textContent).toBe("Compact now");
    flushSync(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(document.activeElement).toBe(ring());
  });

  it("returns focus to the ring when Tab leaves the card", () => {
    render(botWith(usage(176_000)));
    flushSync(() => ring()!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
    const compact = document.activeElement as HTMLElement;
    flushSync(() => compact.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement).toBe(ring());
    expect(ring()!.getAttribute("aria-expanded")).toBe("false");
  });

  it("in the one-chat app asks before compacting, and a click in that question keeps the card open", () => {
    fixture.oneChat = true;
    render(botWith(usage(26_000)));
    flushSync(() => ring()!.click());
    const compactNow = [...card()!.querySelectorAll("button")].find((button) => button.textContent === "Compact now")!;
    flushSync(() => compactNow.click());
    expect(fixture.api).not.toHaveBeenCalled();
    const dialog = document.querySelector<HTMLElement>("[role=alertdialog]")!;
    expect(dialog.textContent).toContain("Compact Maus's conversation?");
    const confirm = [...dialog.querySelectorAll("button")].find((button) => button.textContent === "Compact")!;
    flushSync(() => confirm.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(ring()!.getAttribute("aria-expanded")).toBe("true");
    flushSync(() => confirm.click());
    expect(fixture.api).toHaveBeenCalledWith("/api/bots/maus/compact", { method: "POST", body: JSON.stringify({ threadId: "t1" }) });
    expect(document.querySelector("[role=alertdialog]")).toBeNull();
  });

  it("pins the card open on click and closes it on Escape", () => {
    render(botWith(usage(26_000)));
    flushSync(() => ring()!.click());
    expect(card()).not.toBeNull();
    flushSync(() => ring()!.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" })));
    flushSync(() => vi.advanceTimersByTime(300));
    expect(ring()!.getAttribute("aria-expanded")).toBe("true");
    flushSync(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(ring()!.getAttribute("aria-expanded")).toBe("false");
  });
});
