import { FACE_BOX, type Ring } from "./cursor-face-data";
import type { CursorState, StateEffects } from "./CursorAvatar";

export const FULL_FRAME_MS = 1000 / 60;
export const FRAME_SLACK_MS = 4;
const FRAME_TIERS_MS = [1000 / 20, 1000 / 30, FULL_FRAME_MS];
export const SMALL_MASCOT_PX = 64;
const SMALL_MASCOT_FRAME_MS = FRAME_TIERS_MS[0]!;
export const SMOOTH_STEP_PX = 0.5;
export const VISIBLE_PX = 0.2;
const SETTLE_MS = 1400;
export const GLYPH_EASE_MS = 200;
const CRITICAL_SPRING_PEAK = 1 / Math.E;
export const VIEW_SPAN = FACE_BOX + 30;

const BODY_RADIUS = FACE_BOX / 2;
const TAU = Math.PI * 2;
const DEGREE = Math.PI / 180;

export interface BodyMotion {
  bob?: [number, number];
  sway?: [number, number];
  pulse?: [number, number];
  circle?: [number, number];
  jitter?: [number, number];
  tilt?: number;
  squash?: number;
  enter?: [number, number];
  settle?: number;
}

export const MOTION = {
  sleeping: { pulse: [0.028, 4600], tilt: 2 },
  waking: { enter: [0.92, 700], pulse: [0.03, 2200] },
  idle: { pulse: [0.014, 3600] },
  listening: { bob: [2, 2600], pulse: [0.012, 2600] },
  thinking: { sway: [1.6, 3000], pulse: [0.01, 3000] },
  searching: { bob: [3, 1400], sway: [2.2, 1400] },
  working: { bob: [2.5, 900], squash: 0.22 },

  excited: { bob: [9, 520], sway: [3, 1040], squash: 0.35 },
  surprised: { enter: [1.14, 340], jitter: [0.8, 120] },
  suspicious: { sway: [2.4, 2600], tilt: -3 },
  angry: { jitter: [1.3, 95], tilt: 2 },
  drowsy: { pulse: [0.026, 5000], tilt: 3 },
  happy: { bob: [5, 820], squash: 0.28 },
  curious: { sway: [3.4, 1900], tilt: -4 },
  confused: { sway: [3, 2200] },
  bored: { pulse: [0.016, 5200], tilt: 2 },
  proud: { bob: [1.6, 2400], pulse: [0.02, 2400] },
  shy: { pulse: [0.016, 3000], tilt: 4 },
  sad: { pulse: [0.02, 4600], tilt: 3 },
  laughing: { bob: [7, 430], squash: 0.4 },
  scared: { jitter: [2.2, 75] },
  playful: { bob: [6, 620], sway: [5, 1240], squash: 0.3 },
  celebrate: { bob: [10, 480], sway: [4, 960], squash: 0.35 },

  orbit: { circle: [6, 3200] },
  radar: { sway: [6, 2400], pulse: [0.012, 2400] },
  progress: { pulse: [0.022, 1600] },

  spawning: { enter: [0.02, 820], pulse: [0.014, 3600] },
  humming: { pulse: [0.016, 2800] },
  loading: { sway: [2.2, 1500], pulse: [0.012, 1500] },
  dictating: { bob: [2, 2000] },
  writing: { bob: [1.6, 1100] },
  sending: { bob: [3, 900] },
  receiving: { bob: [3, 900] },
  uploading: { bob: [3, 1000] },
  notifying: { bob: [4, 700], sway: [2.5, 700] },
  alerting: { jitter: [2.6, 85] },
  dragging: { tilt: -6, sway: [2, 900] },
  bouncing: { bob: [12, 560], squash: 0.45 },
  "powering-down": { settle: 0.05, tilt: 4 },
} satisfies Record<CursorState, BodyMotion>;

const easeOutBack = (t: number) => {
  const c = 1.7;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

interface BodyPose {
  dx: number;
  dy: number;
  rotation: number;
  scale: number;
  sx: number;
  sy: number;
}

function bodyPose(motion: BodyMotion, clock: number, elapsed: number, strength: number): BodyPose {
  const wave = (period: number, phase = 0) => Math.sin((clock / period) * TAU + phase);
  const pose = { dx: 0, dy: 0, rotation: motion.tilt ? motion.tilt * strength : 0, scale: 1, sx: 1, sy: 1 };

  if (motion.bob) {
    const [amplitude, period] = motion.bob;
    const p = wave(period);
    pose.dy -= amplitude * strength * p;
    if (motion.squash) {
      const amount = motion.squash * strength * Math.max(0, -p);
      pose.sy = 1 - amount * 0.5;
      pose.sx = 1 + amount * 0.5;
    }
  }
  if (motion.circle) {
    const [radius, period] = motion.circle;
    pose.dx += radius * strength * wave(period);
    pose.dy += radius * strength * wave(period, Math.PI / 2);
  }
  if (motion.sway) {
    const [degrees, period] = motion.sway;
    pose.rotation += degrees * strength * wave(period);
  }
  if (motion.pulse) {
    const [fraction, period] = motion.pulse;
    pose.scale *= 1 + fraction * strength * wave(period);
  }
  if (motion.jitter) {
    const [amplitude, period] = motion.jitter;
    pose.dx += amplitude * strength * wave(period);
    pose.dy += amplitude * strength * wave(period * 0.63, 1.1);
  }
  if (motion.settle !== undefined) {
    const t = Math.min(Math.max(elapsed / SETTLE_MS, 0), 1);
    pose.scale *= 1 + (motion.settle - 1) * easeInOut(t) * strength;
  }
  return pose;
}

function enterScale(motion: BodyMotion, elapsed: number, strength: number): number {
  if (!motion.enter || strength <= 0) return 1;
  const [from, duration] = motion.enter;
  const t = elapsed / duration;
  return t >= 1 ? 1 : from + (1 - from) * easeOutBack(Math.max(t, 0));
}

export const BLEND_MS = 500;

interface MotionLayer {
  motion: BodyMotion;
  start: number;
  weight: number;
}

export interface MotionMix {
  layers: MotionLayer[];
  blendStart: number;
}

const blendProgress = (mix: MotionMix, now: number) => easeInOut(Math.min(Math.max((now - mix.blendStart) / BLEND_MS, 0), 1));

function layerWeights(mix: MotionMix, now: number): number[] {
  const k = blendProgress(mix, now);
  const newest = mix.layers.length - 1;
  return mix.layers.map((layer, i) => (i === newest ? layer.weight + (1 - layer.weight) * k : layer.weight * (1 - k)));
}

export function startMotion(mix: MotionMix | null, motion: BodyMotion, now: number): MotionMix {
  if (!mix) return { layers: [{ motion, start: now, weight: 1 }], blendStart: -Infinity };
  const weights = layerWeights(mix, now);
  const kept = mix.layers.map((layer, i) => ({ ...layer, weight: weights[i]! })).filter((layer) => layer.weight > 0);
  return { layers: [...kept, { motion, start: now, weight: 0 }], blendStart: now };
}

export interface BodyMotionState {
  key: string;
  mix: MotionMix | null;
  resting: boolean;
}

export function retargetBody(body: BodyMotionState, state: CursorState | null, now: number, moving: boolean): void {
  const key = state ?? "";
  if (key !== body.key || !body.mix) {
    body.resting = state === null && body.mix !== null;
    body.key = key;
    body.mix = startMotion(body.mix, state ? MOTION[state] ?? {} : {}, now);
  }
  if (!moving) body.resting = false;
}

export function bodyStillResting(body: BodyMotionState, now: number, faceMoving: boolean): boolean {
  if (body.resting && !faceMoving && !motionBlending(body.mix, now)) body.resting = false;
  return body.resting;
}

export function motionBlending(mix: MotionMix | null, now: number): boolean {
  return mix !== null && now - mix.blendStart < BLEND_MS;
}

export function mixTransform(mix: MotionMix | null, now: number, strength: number): string {
  if (!mix || strength <= 0) return "";
  const weights = layerWeights(mix, now);
  const pose = { dx: 0, dy: 0, rotation: 0, scale: 1, sx: 1, sy: 1 };
  mix.layers.forEach((layer, i) => {
    const w = weights[i]!;
    if (w <= 0) return;
    const elapsed = now - layer.start;
    const part = bodyPose(layer.motion, now, elapsed, strength);
    part.scale *= enterScale(layer.motion, elapsed, strength);
    pose.dx += part.dx * w;
    pose.dy += part.dy * w;
    pose.rotation += part.rotation * w;
    pose.scale += (part.scale - 1) * w;
    pose.sx += (part.sx - 1) * w;
    pose.sy += (part.sy - 1) * w;
  });
  return poseTransform(pose);
}

function poseTransform({ dx, dy, rotation, scale, sx, sy }: BodyPose): string {
  const centre = FACE_BOX / 2;
  const ground = FACE_BOX;
  const parts: string[] = [];
  if (Math.abs(dx) >= 0.005 || Math.abs(dy) >= 0.005) parts.push(`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
  if (Math.abs(rotation) >= 0.005) parts.push(`rotate(${rotation.toFixed(2)} ${centre} ${centre})`);
  if (Math.abs(scale - 1) >= 0.00005) {
    parts.push(`translate(${centre} ${centre}) scale(${scale.toFixed(4)}) translate(${-centre} ${-centre})`);
  }
  if (Math.abs(sx - 1) >= 0.00005 || Math.abs(sy - 1) >= 0.00005) {
    parts.push(`translate(${centre} ${ground}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-centre} ${-ground})`);
  }
  return parts.join(" ");
}

export interface CadenceInput {
  motion: BodyMotion;
  effects: StateEffects | undefined;
  stateElapsedMs: number;
  strength: number;
  showEffects: boolean;
  showGlyphs: boolean;
  sizePx: number;
  faceUnitsPerMs: number;
  blinkingOrSpinning: boolean;
  spinning?: boolean;
  blending?: boolean;
}

export function frameIntervalFor(pxPerMs: number): number {
  if (!(pxPerMs > 0)) return Infinity;
  for (const ms of FRAME_TIERS_MS) if (pxPerMs * ms <= SMOOTH_STEP_PX) return ms;
  return FULL_FRAME_MS;
}

function loopSpeed(amplitude: number, period: number, px: number): number {
  return amplitude * px >= VISIBLE_PX ? (TAU * amplitude * px) / period : 0;
}

export function bodyPxPerMs(motion: BodyMotion, strength: number, px: number): number {
  if (strength <= 0) return 0;
  let speed = 0;
  if (motion.bob) {
    speed += loopSpeed(motion.bob[0] * strength, motion.bob[1], px);
    if (motion.squash) speed += loopSpeed(motion.squash * strength * 0.5 * FACE_BOX, motion.bob[1], px);
  }
  if (motion.sway) speed += loopSpeed(motion.sway[0] * strength * DEGREE * BODY_RADIUS, motion.sway[1], px);
  if (motion.pulse) speed += loopSpeed(motion.pulse[0] * strength * BODY_RADIUS, motion.pulse[1], px);
  if (motion.circle) speed += loopSpeed(motion.circle[0] * strength, motion.circle[1], px);
  if (motion.jitter) speed += loopSpeed(motion.jitter[0] * strength, motion.jitter[1] * 0.63, px);
  return speed;
}

function bodyTransient(motion: BodyMotion, elapsed: number): boolean {
  return Boolean(motion.enter && elapsed < motion.enter[1]) || (motion.settle !== undefined && elapsed < SETTLE_MS);
}

export function nextFrameAt(now: number, interval: number): number {
  if (interval === Infinity) return Infinity;
  return (Math.floor((now + FRAME_SLACK_MS) / interval) + 1) * interval;
}

export function frameFloorMs(sizePx: number): number {
  return sizePx <= SMALL_MASCOT_PX ? SMALL_MASCOT_FRAME_MS : FULL_FRAME_MS;
}

/** A spin, an entrance or a blend plays once, for under a second, so it runs at full rate at any size. */
export function nextMascotFrame(now: number, input: CadenceInput): number {
  const oneShot = input.spinning || (input.strength > 0 && (input.blending || bodyTransient(input.motion, input.stateElapsedMs)));
  if (oneShot) return nextFrameAt(now, FULL_FRAME_MS);
  return Math.max(smoothFrameAt(now, input), nextFrameAt(now, frameFloorMs(input.sizePx)));
}

/** Ease-out that swings about 13 degrees past a full turn and settles back. */
export function spinEase(t: number): number {
  const u = t - 1;
  return 1 + 2 * u ** 3 + u ** 2;
}

function smoothFrameAt(now: number, input: CadenceInput): number {
  const { motion, effects, stateElapsedMs: elapsed, strength } = input;
  const full = nextFrameAt(now, FULL_FRAME_MS);
  if (input.blinkingOrSpinning) return full;
  if (strength > 0 && input.showEffects && (effects?.confetti || effects?.trails)) return full;
  if (strength > 0 && bodyTransient(motion, elapsed)) return full;
  const px = input.sizePx / VIEW_SPAN;
  const due = nextFrameAt(now, frameIntervalFor(bodyPxPerMs(motion, strength, px) + input.faceUnitsPerMs * px));
  const glyph = input.showGlyphs ? effects?.glyph : undefined;
  if (!glyph) return due;
  const position = elapsed % glyph.period;
  const shown = glyph.period - glyph.hold;
  if (position < shown) return Math.min(due, now + shown - position);
  const fadingOut = glyph.period - GLYPH_EASE_MS;
  if (position < shown + GLYPH_EASE_MS || position >= fadingOut) return full;
  return Math.min(due, now + fadingOut - position);
}

export const BLINK_MS = 320;
export const REST_HOP_MS = 1300;
export const REST_CYCLE_MS = 4000;
const REST_BLINK_FROM_MS = 1600;
const REST_BLINK_SPAN_MS = 2000;

function restBlinkOffset(cycle: number): number {
  const x = Math.sin(cycle * 12.9898) * 43758.5453;
  return REST_BLINK_FROM_MS + (x - Math.floor(x)) * REST_BLINK_SPAN_MS;
}

/** One blink per rest cycle, after the hop lands, at an offset that varies by cycle but not by copy: every face
 * resting since the same moment blinks on the same frame. */
export function nextRestBlink(since: number, now: number): number {
  for (let cycle = Math.max(0, Math.floor((now - since) / REST_CYCLE_MS)); ; cycle++) {
    const at = since + cycle * REST_CYCLE_MS + restBlinkOffset(cycle);
    if (at > now) return at;
  }
}

export function blinkScale(e: { blinkStart: number | null }, now: number): number {
  if (e.blinkStart === null) return 1;
  const t = Math.max(0, (now - e.blinkStart) / BLINK_MS);
  if (t >= 1) {
    e.blinkStart = null;
    return 1;
  }
  return Math.max(t < 0.42 ? 1 - t / 0.42 : (t - 0.42) / 0.58, 0.04);
}

export function morphUnitsPerMs(velocity: number, morph: number, stiffness: number, travel: number): number {
  if (morph >= 1) return 0;
  return (Math.max(Math.abs(velocity), CRITICAL_SPRING_PEAK * stiffness * (1 - morph)) / 1000) * travel;
}

export function faceTravelUnits(
  from: { rings: Ring[]; mouth: number[]; gaze: number[] },
  to: { rings: Ring[]; mouth: number[]; gaze: number[] },
): number {
  let travel = 0;
  from.rings.forEach((ring, eye) => ring.forEach((point, i) => {
    const target = to.rings[eye][i];
    travel = Math.max(travel, Math.hypot(target[0] - point[0], target[1] - point[1]));
  }));
  from.mouth.forEach((value, i) => { travel = Math.max(travel, Math.abs(to.mouth[i] - value)); });
  return travel + Math.hypot(to.gaze[0] - from.gaze[0], to.gaze[1] - from.gaze[1]);
}
