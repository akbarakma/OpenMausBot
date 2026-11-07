// @vitest-environment happy-dom
import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot } from "@/state/store";

const tern = {
  id: "tern", name: "Tern", title: "Upstream Watcher", color: "red", threadId: "t1", tasks: [],
  messages: [{ id: "m1", role: "bot", kind: "text", text: "Release notes are up.", at: 1 }],
} as unknown as Bot;
const frosty = { ...tern, id: "frosty", name: "Frosty", title: "Fleet Ops" } as Bot;

vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, useStore: () => ({ state: { ...original.initialState, bots: [tern, frosty], groups: [], instances: [] }, dispatch: vi.fn() }) };
});
vi.mock("./Avatar", () => ({ BotAvatar: () => null }));
vi.mock("./unread-notice", () => ({ useBotUnread: () => ({ unread: false, noticing: false }) }));

const { SidebarRailCard } = await import("./SidebarRailCard");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
let tile: HTMLButtonElement;
let other: HTMLButtonElement;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const rail = createRef<HTMLElement>();
  act(() => root.render(createElement("nav", { ref: rail },
    createElement("button", { "data-sidebar-bot-row": "tern" }, "Tern"),
    createElement("button", { "data-sidebar-bot-row": "frosty" }, "Frosty"),
    createElement(SidebarRailCard, { railRef: rail }))));
  tile = host.querySelector("[data-sidebar-bot-row=tern]")!;
  other = host.querySelector("[data-sidebar-bot-row=frosty]")!;
  tile.getBoundingClientRect = () => ({ top: 100, height: 54, bottom: 154, left: 19, right: 73, width: 54, x: 19, y: 100, toJSON: () => ({}) });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const card = () => document.querySelector<HTMLElement>("[data-sidebar-rail-card]");
const pointer = (type: string, target: Element, relatedTarget: Element | null = null) =>
  act(() => { target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse", relatedTarget })); });

describe("the rail's hover card", () => {
  it("opens after a short hover with the bot's name, title chip and newest line, and closes when the pointer leaves", () => {
    pointer("pointerover", tile);
    expect(card()).toBeNull();
    act(() => { vi.advanceTimersByTime(300); });
    expect(card()?.textContent).toContain("Tern");
    expect(card()?.textContent).toContain("Upstream Watcher");
    expect(card()?.textContent).toContain("Release notes are up.");
    pointer("pointerout", tile, document.body);
    act(() => { vi.advanceTimersByTime(100); });
    expect(card()).toBeNull();
  });

  it("switches to the next tile at once while a card is open", () => {
    pointer("pointerover", tile);
    act(() => { vi.advanceTimersByTime(300); });
    pointer("pointerout", tile, other);
    pointer("pointerover", other);
    expect(card()?.textContent).toContain("Frosty");
    expect(card()?.textContent).not.toContain("Tern");
  });

  it("never opens for a hover shorter than the delay", () => {
    pointer("pointerover", tile);
    act(() => { vi.advanceTimersByTime(200); });
    pointer("pointerout", tile, document.body);
    act(() => { vi.advanceTimersByTime(400); });
    expect(card()).toBeNull();
  });
});
