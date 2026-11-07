import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Bot, Message } from "@/state/store";

const mode = vi.hoisted(() => ({ advanced: false }));
vi.mock("@/lib/interface-mode", () => ({ useAdvancedMode: () => mode.advanced }));

const { botFaceState, restOrigin, useBotFace } = await import("./bot-face");

const bot = (patch: Partial<Bot> = {}) => ({ name: "Rina", title: "QA Reviewer", description: "", mascotExpression: null, ...patch }) as Bot;
const failedTool = [{ id: "a", kind: "activity", role: "bot", at: 1, tool: { ok: false } }] as unknown as Message[];
const options = [{ id: "o", kind: "options", role: "bot", at: 1 }] as unknown as Message[];

describe("botFaceState", () => {
  it("shows happy on a selected bot at rest, over its role face and a pinned face", () => {
    expect(botFaceState(bot(), [], false, false)).toBe("suspicious");
    expect(botFaceState(bot(), [], false, true)).toBe("happy");
    expect(botFaceState(bot({ mascotExpression: "drowsy" }), [], false, true)).toBe("happy");
  });

  it("keeps a failed tool and a waiting question on a selected bot's face", () => {
    expect(botFaceState(bot(), failedTool, false, true)).toBe("alerting");
    expect(botFaceState(bot(), options, false, true)).toBe("curious");
  });

  it("shows work while the bot runs, selected or not", () => {
    expect(botFaceState(bot(), [], true, true)).toBe("working");
    expect(botFaceState(bot(), [], true, false)).toBe("working");
  });
});

describe("restOrigin", () => {
  it("gives every copy of a resting bot the time it came to rest, and starts over after it leaves rest", () => {
    expect(restOrigin("rina", true, 1_000)).toBe(1_000);
    expect(restOrigin("rina", true, 4_200)).toBe(1_000);
    expect(restOrigin("rina", false, 5_000)).toBeNull();
    expect(restOrigin("rina", true, 6_000)).toBe(6_000);
    restOrigin("rina", false);
  });
});

describe("useBotFace", () => {
  type Input = Parameters<typeof useBotFace>[0];
  const faceOf = (input: Partial<Input>) => {
    let face: ReturnType<typeof useBotFace> | undefined;
    function Probe() {
      face = useBotFace({ bot: { ...bot(), id: "probe" } as Bot, messages: [], running: false, selected: true, motion: null, ...input });
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    restOrigin("probe", false);
    return face!;
  };

  it("passes no motion once its beat has run, so a remounted face does not replay it", () => {
    const fired = (at: number) => ({ botId: "probe", nonce: 3, at, kind: "switch" as const });
    expect(faceOf({ hops: true, motion: fired(Date.now()) }).motion).toBe("switch");
    const stale = faceOf({ hops: true, motion: fired(Date.now() - 10_000) });
    expect(stale.motion).toBe("none");
    expect(stale.restingSince).not.toBeNull();
  });

  it("hops only the copy asked to, and only in Simple mode", () => {
    expect(faceOf({ hops: true })).toMatchObject({ state: "happy", animated: true });
    expect(faceOf({ hops: true }).restingSince).not.toBeNull();
    expect(faceOf({})).toMatchObject({ state: "happy", animated: false, restingSince: null });
    mode.advanced = true;
    try {
      expect(faceOf({ hops: true })).toMatchObject({ state: "suspicious", animated: false, restingSince: null });
    } finally {
      mode.advanced = false;
    }
  });
});
