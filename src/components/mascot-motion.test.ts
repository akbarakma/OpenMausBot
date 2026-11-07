import { describe, expect, it } from "vitest";

import { EFFECTS, type CursorState } from "./CursorAvatar";
import {
  FULL_FRAME_MS,
  GLYPH_EASE_MS,
  BLEND_MS,
  MOTION,
  SMALL_MASCOT_PX,
  SMOOTH_STEP_PX,
  frameIntervalFor,
  mixTransform,
  morphUnitsPerMs,
  motionBlending,
  nextFrameAt,
  nextMascotFrame,
  BLINK_MS,
  nextRestBlink,
  REST_CYCLE_MS,
  REST_HOP_MS,
  spinEase,
  startMotion,
  type CadenceInput,
} from "./mascot-motion";

const NOW = 10_000;

function delay(state: CursorState, sizePx: number, extra: Partial<CadenceInput> = {}): number {
  return nextMascotFrame(NOW, {
    motion: MOTION[state],
    effects: EFFECTS[state],
    stateElapsedMs: 60_000,
    strength: 1,
    showEffects: true,
    showGlyphs: true,
    sizePx,
    faceUnitsPerMs: 0,
    blinkingOrSpinning: false,
    ...extra,
  }) - NOW;
}

describe("mascot cadence", () => {
  it("picks the slowest frame tier that keeps each step smooth", () => {
    expect(frameIntervalFor(0)).toBe(Infinity);
    expect(frameIntervalFor(SMOOTH_STEP_PX / 50)).toBe(50);
    expect(frameIntervalFor(SMOOTH_STEP_PX / 40)).toBeCloseTo(1000 / 30);
    expect(frameIntervalFor(SMOOTH_STEP_PX / 20)).toBeCloseTo(FULL_FRAME_MS);
    expect(frameIntervalFor(1)).toBeCloseTo(FULL_FRAME_MS);
  });

  it("gives idle breathing no frames where it cannot be seen and a slow tier where it can", () => {
    expect(delay("idle", 24)).toBe(Infinity);
    expect(delay("idle", 64)).toBeGreaterThan(30);
    expect(delay("idle", 64)).toBeLessThanOrEqual(50);
    expect(delay("sleeping", 112)).toBeGreaterThan(30);
  });

  it("runs real motion at full rate", () => {
    expect(delay("working", 96)).toBeCloseTo(FULL_FRAME_MS);
    expect(delay("celebrate", 96)).toBeCloseTo(FULL_FRAME_MS);
    expect(delay("idle", 96, { blinkingOrSpinning: true })).toBeCloseTo(FULL_FRAME_MS);
    expect(delay("spawning", 96, { stateElapsedMs: 100 })).toBeCloseTo(FULL_FRAME_MS);
    expect(delay("spawning", 96, { stateElapsedMs: 5_000 })).toBeGreaterThan(30);
  });

  it("draws row, chip and header mascots at most 20 times a second", () => {
    for (const size of [24, 36, 42, SMALL_MASCOT_PX]) {
      expect(delay("working", size)).toBeGreaterThan(40);
      expect(delay("working", size)).toBeLessThanOrEqual(50);
      expect(delay("celebrate", size)).toBeLessThanOrEqual(50);
      expect(delay("idle", size, { blinkingOrSpinning: true })).toBeLessThanOrEqual(50);
      expect(delay("idle", size, { blinkingOrSpinning: true })).toBeGreaterThan(40);
    }
    expect(delay("working", SMALL_MASCOT_PX + 1)).toBeCloseTo(FULL_FRAME_MS);
  });

  it("holds still with no motion strength", () => {
    expect(delay("working", 220, { strength: 0 })).toBe(Infinity);
    expect(delay("celebrate", 220, { strength: 0 })).toBe(Infinity);
  });

  it("puts every tier on one 60 Hz grid so mascots on different phases draw in the same frame", () => {
    expect(nextFrameAt(1003, 50)).toBe(nextFrameAt(1011, 50));
    expect(nextFrameAt(1003, 50) - 1003).toBeGreaterThanOrEqual(40);
    expect(nextFrameAt(1001, FULL_FRAME_MS)).toBe(nextFrameAt(1008, FULL_FRAME_MS));
    for (const interval of [50, 1000 / 30, FULL_FRAME_MS]) {
      const ticks = nextFrameAt(5_000, interval) / FULL_FRAME_MS;
      expect(Math.abs(ticks - Math.round(ticks))).toBeLessThan(1e-9);
    }
  });

  it("draws an alert glyph's fades at full rate and rests between them", () => {
    const glyph = EFFECTS.confused!.glyph!;
    const shown = glyph.period - glyph.hold;
    const at = (position: number) => delay("confused", 112, { stateElapsedMs: glyph.period * 3 + position });
    expect(at(shown - 400)).toBeGreaterThan(2 * FULL_FRAME_MS);
    expect(at(shown - 400)).toBeLessThanOrEqual(400);
    expect(at(shown + 10)).toBeCloseTo(FULL_FRAME_MS);
    expect(at(shown + GLYPH_EASE_MS + 100)).toBeGreaterThan(2 * FULL_FRAME_MS);
    expect(at(glyph.period - 10)).toBeCloseTo(FULL_FRAME_MS);
    expect(delay("confused", 112, { stateElapsedMs: glyph.period * 3 + shown + 10, showGlyphs: false })).toBeGreaterThan(2 * FULL_FRAME_MS);
  });

  it("follows an expression change until it settles", () => {
    expect(morphUnitsPerMs(0, 1, 7, 40)).toBe(0);
    const start = morphUnitsPerMs(0, 0, 7, 40);
    expect(start).toBeGreaterThan(0);
    expect(delay("idle", 24, { faceUnitsPerMs: start })).toBeLessThan(Infinity);
    expect(morphUnitsPerMs(0, 0.99, 7, 40)).toBeLessThan(start / 50);
  });

  it("spins and enters at full rate at any size, while blinks keep the small-mascot floor", () => {
    expect(delay("idle", 40, { blinkingOrSpinning: true, spinning: true })).toBeCloseTo(FULL_FRAME_MS);
    expect(delay("waking", 40, { stateElapsedMs: 100 })).toBeCloseTo(FULL_FRAME_MS);
    expect(delay("idle", 40, { blinkingOrSpinning: true })).toBeGreaterThan(40);
  });

  it("eases the spin past a full turn and back onto it", () => {
    expect(spinEase(0)).toBe(0);
    expect(spinEase(1)).toBe(1);
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => spinEase(i / 100)));
    expect(peak * 360 - 360).toBeGreaterThan(8);
    expect(peak * 360 - 360).toBeLessThan(18);
  });
});

describe("body motion mix", () => {
  const numbers = (transform: string) => (transform.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const close = (a: string, b: string, tolerance: number) => {
    const [x, y] = [numbers(a), numbers(b)];
    expect(x.length).toBe(y.length);
    x.forEach((value, i) => expect(Math.abs(value - y[i]!)).toBeLessThanOrEqual(tolerance));
  };

  it("moves two copies of one state in step, whenever each one started", () => {
    const early = startMotion(null, MOTION.happy, 1_000);
    const late = startMotion(null, MOTION.happy, 7_345);
    for (const now of [8_000, 8_210, 9_999]) expect(mixTransform(late, now, 1)).toBe(mixTransform(early, now, 1));
  });

  it("starts a new motion from the pose on screen and reaches it after BLEND_MS", () => {
    const working = startMotion(null, MOTION.working, 0);
    const happy = startMotion(working, MOTION.happy, 5_000);
    close(mixTransform(happy, 5_000, 1), mixTransform(working, 5_000, 1), 0.01);
    close(mixTransform(happy, 5_016, 1), mixTransform(working, 5_016, 1), 0.2);
    expect(motionBlending(happy, 5_000 + BLEND_MS - 1)).toBe(true);
    expect(motionBlending(happy, 5_000 + BLEND_MS)).toBe(false);
    expect(mixTransform(happy, 5_000 + BLEND_MS + 300, 1)).toBe(mixTransform(startMotion(null, MOTION.happy, 0), 5_000 + BLEND_MS + 300, 1));
  });

  it("changes course mid-blend without a jump", () => {
    const working = startMotion(null, MOTION.working, 0);
    const happy = startMotion(working, MOTION.happy, 5_000);
    const rest = startMotion(happy, {}, 5_200);
    close(mixTransform(rest, 5_200, 1), mixTransform(happy, 5_200, 1), 0.01);
    expect(mixTransform(rest, 5_200 + BLEND_MS, 1)).toBe("");
  });

  it("fades an entrance in from the pose on screen instead of popping its scale", () => {
    const working = startMotion(null, MOTION.working, 0);
    for (const state of ["waking", "surprised", "spawning"] as const) {
      const entering = startMotion(working, MOTION[state], 5_000);
      close(mixTransform(entering, 5_000, 1), mixTransform(working, 5_000, 1), 0.01);
    }
  });

  it("settles an entrance cut short at the still pose", () => {
    const spawning = startMotion(null, MOTION.spawning, 0);
    const rest = startMotion(spawning, {}, 100);
    expect(mixTransform(rest, 100 + BLEND_MS, 1)).toBe("");
    expect(rest.layers).toHaveLength(2);
    expect(startMotion(rest, MOTION.idle, 100 + BLEND_MS).layers).toHaveLength(2);
  });

  it("holds still with no motion strength", () => {
    expect(mixTransform(startMotion(null, MOTION.celebrate, 0), 400, 0)).toBe("");
  });
});

describe("nextRestBlink", () => {
  it("gives copies that start looking at different moments the same blinks, one per cycle after the hop lands", () => {
    const since = 5_000;
    const early = [nextRestBlink(since, since)];
    while (early.length < 6) early.push(nextRestBlink(since, early.at(-1)!));
    const late = nextRestBlink(since, since + 9_000);
    expect(early).toContain(late);
    early.forEach((at, cycle) => {
      const into = at - since - cycle * REST_CYCLE_MS;
      expect(into).toBeGreaterThan(REST_HOP_MS);
      expect(into).toBeLessThan(REST_CYCLE_MS);
    });
  });

  it("lets a copy that starts looking mid-blink find the blink already in progress", () => {
    const since = 5_000;
    const blink = nextRestBlink(since, since);
    expect(nextRestBlink(since, blink + 100 - BLINK_MS)).toBe(blink);
  });
});
