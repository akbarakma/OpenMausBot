// @vitest-environment happy-dom
import { act, createElement, forwardRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./CursorAvatar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./CursorAvatar")>()),
  CursorAvatar: forwardRef<unknown, { state: string; effects?: boolean }>(({ state, effects }, _ref) =>
    createElement("svg", { "data-state": state, "data-effects": String(effects) })),
}));

const { BotAvatar } = await import("./Avatar");
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
