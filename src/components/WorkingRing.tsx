import { useEffect, useRef, useState } from "react";

import type { MausState } from "@/lib/mascot";
import { EFFECTS, hash01, RIBBON_COLORS, VIEW_BOX, type TrailSpec } from "./CursorAvatar";
import { FACE_BOX } from "./cursor-face-data";

export const RING_FADE_MS = 300;
export const RING_FPS = 30;
const SAMPLES = 12;
const CENTRE = FACE_BOX / 2;
const TAU = Math.PI * 2;

export interface Ribbon {
  d: string;
  stroke: string;
  width: number;
  periodMs: number;
  reverse: boolean;
}

export function ringSpec(state: MausState): TrailSpec {
  return EFFECTS[state]?.trails ?? EFFECTS.orbit!.trails!;
}

/** The face's own trails, each drawn once at its starting angle; the ring's container squashes them onto the same oval. */
export function ringRibbons(spec: TrailSpec): Ribbon[] {
  return Array.from({ length: spec.count }, (_, i) => {
    const seedA = hash01(i + 3);
    const seedB = hash01(i + 29);
    const radius = spec.radius * (0.78 + seedB * 0.4);
    const start = seedA * TAU;
    const span = 0.85 + seedB * 0.7;
    let d = "";
    for (let s = 0; s <= SAMPLES; s++) {
      const k = s / SAMPLES;
      const angle = start + span * k;
      const r = radius * (1 + Math.sin(k * Math.PI) * 0.14);
      d += `${s === 0 ? "M" : "L"}${(CENTRE + Math.cos(angle) * r).toFixed(1)} ${(CENTRE + Math.sin(angle) * r).toFixed(1)}`;
    }
    return {
      d,
      stroke: RIBBON_COLORS[i % RIBBON_COLORS.length]!,
      width: 5 + seedA * 3,
      periodMs: Math.round(spec.period * (0.8 + seedA * 0.5)),
      reverse: i % 2 !== 0,
    };
  });
}

let offscreen: IntersectionObserver | null | undefined;

function watchOnScreen(element: Element): () => void {
  offscreen ??= typeof IntersectionObserver === "function"
    ? new IntersectionObserver((changes) => {
      for (const change of changes) change.target.toggleAttribute("data-offscreen", !change.isIntersecting);
    }, { rootMargin: "64px" })
    : null;
  offscreen?.observe(element);
  return () => offscreen?.unobserve(element);
}

function useRingPresence(active: boolean): boolean {
  const [present, setPresent] = useState(active);
  if (active && !present) setPresent(true);
  useEffect(() => {
    if (active || !present) return;
    const timer = setTimeout(() => setPresent(false), RING_FADE_MS);
    return () => clearTimeout(timer);
  }, [active, present]);
  return present;
}

/** Orbit trails around a working bot's avatar. CSS spins each ribbon on the compositor, so the main thread and the
 * mascot clock stay asleep; steps() caps the frames it asks for, because a smooth spin redraws every display frame. */
export function WorkingRing({ active, state }: { active: boolean; state: MausState }) {
  const present = useRingPresence(active);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => (present && box.current ? watchOnScreen(box.current) : undefined), [present]);
  if (!present) return null;
  return (
    <span
      ref={box}
      aria-hidden="true"
      data-testid="working-ring"
      className="working-ring pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity: active ? 1 : 0 }}
    >
      <span className="absolute inset-0 scale-y-[0.78]">
        {ringRibbons(ringSpec(state)).map((ribbon) => (
          <svg
            key={ribbon.d}
            viewBox={VIEW_BOX}
            className="absolute inset-0 size-full"
            style={{
              animationDuration: `${ribbon.periodMs}ms`,
              animationDirection: ribbon.reverse ? "reverse" : "normal",
              animationTimingFunction: `steps(${Math.round((ribbon.periodMs * RING_FPS) / 1000)})`,
            }}
          >
            <path d={ribbon.d} fill="none" stroke={ribbon.stroke} strokeWidth={ribbon.width.toFixed(1)} strokeLinecap="round" opacity={0.85} />
          </svg>
        ))}
      </span>
    </span>
  );
}
