// @vitest-environment happy-dom
import { act, createElement, forwardRef } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./CursorAvatar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./CursorAvatar")>()),
  CursorAvatar: forwardRef<unknown, { state: string; effects?: boolean }>(({ state, effects }, _ref) =>
    createElement("svg", { "data-state": state, "data-effects": String(effects) })),
}));

const { BotAvatar } = await import("./Avatar");
const { REST_CYCLE_MS, REST_HOP_MS } = await import("./mascot-motion");
const { sidebarBotStatus } = await import("./SidebarBotActivity");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const face = () => host.querySelector("svg[data-state]")!;
const show = (props: { motion: "switch" | "launch" | "none"; animated: boolean; working?: boolean }) =>
  act(() => root.render(createElement(BotAvatar, { bot: { color: "green" }, state: "idle", motionKey: 1, ...props })));

describe("BotAvatar motion beats", () => {
  it("drops the beat's face when the avatar stops animating before the face's own timer", () => {
    show({ motion: "switch", animated: true, working: false });
    expect(face().getAttribute("data-state")).toBe("waking");
    show({ motion: "switch", animated: false, working: false });
    expect(face().getAttribute("data-state")).toBe("idle");
  });

  it("keeps the face's trails off when a beat turns it into a trail face", () => {
    show({ motion: "launch", animated: true, working: true });
    expect(face().getAttribute("data-state")).toBe("loading");
    expect(face().getAttribute("data-effects")).toBe("false");
  });
});

describe("the resting hop", () => {
  const hop = () => host.querySelector(".bot-rest-hop") as HTMLElement | null;
  const rest = (restingSince: number | null) =>
    act(() => root.render(createElement(BotAvatar, { bot: { color: "green" }, state: "happy", animated: true, working: false, restingSince })));

  const withClock = (body: () => void) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      vi.advanceTimersByTime(10_000);
      body();
    } finally {
      vi.useRealTimers();
    }
  };

  it("starts the hop at the shared rest moment, and lands a hop in the air before it stops", () => withClock(() => {
    const animation = { startTime: null as number | null };
    const getAnimations = vi.spyOn(HTMLElement.prototype, "getAnimations").mockReturnValue([animation] as unknown as Animation[]);
    const since = performance.now() - 400;
    rest(since);
    expect(hop()!.style.animationDuration).toBe(`${REST_CYCLE_MS}ms`);
    expect(animation.startTime).toBe(since);
    getAnimations.mockRestore();
    act(() => { vi.advanceTimersByTime(300); });
    rest(null);
    act(() => { vi.advanceTimersByTime(REST_HOP_MS - 700 - 20); });
    expect(hop()).not.toBeNull();
    act(() => { vi.advanceTimersByTime(40); });
    expect(hop()).toBeNull();
  }));

  it("lands every keyframe of the CSS hop within REST_HOP_MS of the cycle", () => {
    const block = readFileSync("src/styles.css", "utf8").match(/@keyframes bot-rest-hop \{([\s\S]*?)\n\}/)![1]!;
    const moving = [...block.matchAll(/^\s*([\d.%, ]+)\{\s*transform: (?!none)/gm)].flatMap((m) => m[1]!.split(",").map((p) => Number.parseFloat(p)));
    expect(moving.length).toBeGreaterThan(0);
    expect(Math.max(...moving)).toBeLessThan((REST_HOP_MS / REST_CYCLE_MS) * 100);
  });

  it("stops at once when rest ends during the still part of the cycle", () => withClock(() => {
    rest(performance.now() - REST_HOP_MS - 500);
    rest(null);
    act(() => { vi.advanceTimersByTime(0); });
    expect(hop()).toBeNull();
  }));
});

describe("the working ring's place", () => {
  it("draws over an image avatar, which would hide a ring behind it", () => {
    const markup = renderToStaticMarkup(createElement(BotAvatar, {
      bot: { color: "green", avatarUrl: "/api/attachments/a1.png", avatarCrop: "square" }, animated: false, working: true,
    }));
    expect(markup.indexOf("<img")).toBeGreaterThan(-1);
    expect(markup.indexOf('data-testid="working-ring"')).toBeGreaterThan(markup.indexOf("<img"));
  });
});

describe("sidebarBotStatus", () => {
  it("reports a thread still running while another thread waits on the person", () => {
    const status = sidebarBotStatus({
      id: "b", name: "Kara", color: "green", busy: false,
      tasks: [
        { threadId: "t1", title: "Asks", createdAt: 1, activity: "waiting-on-you" },
        { threadId: "t2", title: "Runs", createdAt: 2, busy: true },
      ],
    } as unknown as Parameters<typeof sidebarBotStatus>[0], {});
    expect(status.waiting).toBe(true);
    expect(status.working).toBe(false);
    expect(status.running).toBe(true);
  });
});
