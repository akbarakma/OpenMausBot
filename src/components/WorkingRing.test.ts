import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MausState } from "@/lib/mascot";
import { BotAvatar } from "./Avatar";
import { EFFECTS } from "./CursorAvatar";
import { RING_FPS, ringRibbons, ringSpec } from "./WorkingRing";

const avatar = (working: boolean | undefined, state: MausState = "working", greet = false) =>
  renderToStaticMarkup(createElement(BotAvatar, { bot: { color: "green" }, state, animated: false, working, greet }));

const ribbons = (markup: string) => markup.match(/<path d="M[^"]*" fill="none" stroke="#/g) ?? [];

describe("the working ring", () => {
  it("circles a working bot with the orbit's ribbons when its face has none", () => {
    const markup = avatar(true, "working");
    expect(markup).toContain('data-testid="working-ring"');
    expect(ribbons(markup)).toHaveLength(EFFECTS.orbit!.trails!.count);
  });

  it("uses the face's own ribbons when it has them", () => {
    expect(ribbons(avatar(true, "radar"))).toHaveLength(EFFECTS.radar!.trails!.count);
  });

  it("draws nothing for a bot that is not working, or where the avatar never shows work", () => {
    expect(avatar(false)).not.toContain("working-ring");
    expect(avatar(undefined)).not.toContain("working-ring");
  });

  it("asks for at most RING_FPS frames a second", () => {
    const markup = avatar(true);
    const steps = [...markup.matchAll(/animation-direction:\w+;animation-duration:(\d+)ms;animation-timing-function:steps\((\d+)\)/g)];
    expect(steps).toHaveLength(EFFECTS.orbit!.trails!.count);
    for (const [, duration, count] of steps) expect(Number(count) / (Number(duration) / 1000)).toBeLessThanOrEqual(RING_FPS + 0.5);
  });

  it("spins the ribbons both ways", () => {
    expect(new Set(ringRibbons(ringSpec("orbit")).map((ribbon) => ribbon.reverse))).toEqual(new Set([true, false]));
  });

  it("sweeps once for a selected bot that is not working, and keeps spinning for one that is", () => {
    const greeting = avatar(false, "idle", true);
    expect(greeting).toContain('data-greet="true"');
    expect(greeting).not.toContain("animation-timing-function:steps");
    expect(avatar(true, "idle", true)).not.toContain("data-greet");
  });
});
