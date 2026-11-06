// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot, Message, TaskUsage } from "@/state/store";

const fixture = vi.hoisted(() => ({ advanced: false, api: vi.fn() }));
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return {
    ...original,
    api: (...args: unknown[]) => fixture.api(...args),
    useStore: () => ({ state: original.initialState, dispatch: vi.fn() }),
  };
});
vi.mock("@/lib/interface-mode", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/interface-mode")>(),
  useAdvancedMode: () => fixture.advanced,
}));

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
const render = (bot: Bot) => flushSync(() => root.render(createElement(ComposerContextMeter, { bot, compact: true })));
const ring = () => host.querySelector<HTMLButtonElement>("[data-composer-context]");
const card = () => document.querySelector<HTMLElement>("[data-composer-context-card]");
const hover = () => {
  flushSync(() => ring()!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
  flushSync(() => ring()!.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" })));
  flushSync(() => vi.advanceTimersByTime(150));
};

beforeEach(() => {
  vi.useFakeTimers();
  fixture.advanced = false;
  fixture.api.mockReset().mockResolvedValue({});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("ComposerContextMeter", () => {
  it("stays out of the composer until the provider reports context", () => {
    render(botWith(undefined));
    expect(ring()).toBeNull();
    render(botWith({ input: 0, output: 0, costUsd: null, turns: 0 }));
    expect(ring()).toBeNull();
  });

  it("opens a card with only the context reading on hover in Simple mode", () => {
    render(botWith(usage(26_000)));
    expect(ring()!.getAttribute("aria-label")).toBe("13% context used");
    expect(card()).toBeNull();
    hover();
    expect(card()!.textContent).toBe("Context13% · 26k / 200k");
    expect(card()!.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("13");
    expect(card()!.querySelector("table")).toBeNull();
  });

  it("adds the token table in Advanced mode", () => {
    fixture.advanced = true;
    render(botWith(usage(26_000, { lastTurn: { input: 26_000, cachedInput: 24_800, output: 860, costUsd: null } })));
    hover();
    const rows = [...card()!.querySelectorAll("tbody tr")].map((row) => [...row.children].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ["Uncached input", "38k", "1.2k"],
      ["Cached input", "1.1M", "24.8k"],
      ["Output", "52k", "860"],
    ]);
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
