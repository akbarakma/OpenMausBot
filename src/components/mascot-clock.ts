import { useSyncExternalStore } from "react";

import { onWindowFocusChange, windowFocused } from "@/lib/window-focus";

import { FRAME_SLACK_MS, FULL_FRAME_MS } from "./mascot-motion";

export type MascotFrame = (now: number) => number;

export interface MascotTicket {
  wake(by?: number): void;
  remove(): void;
}

export interface VisibilityWatch {
  observe(element: Element): void;
  unobserve(element: Element): void;
}

export interface ClockEnvironment {
  now(): number;
  requestFrame(callback: (now: number) => void): number;
  cancelFrame(handle: number): void;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  watchVisibility(onChange: (changes: Array<{ target: Element; isIntersecting: boolean }>) => void): VisibilityWatch | null;
  /** True while the clock should draw nothing: the page is hidden or the window is not focused. */
  asleep(): boolean;
  onAsleepChange(listener: () => void): void;
}

export interface MascotClock {
  add(frame: MascotFrame, element?: Element | null): MascotTicket;
  pending(): number;
}

interface Entry {
  frame: MascotFrame;
  due: number;
  onScreen: boolean;
  painted: boolean;
}

const TIMER_LEAD_MS = 1;

export function createMascotClock(env: ClockEnvironment): MascotClock {
  const entries = new Set<Entry>();
  const byElement = new Map<Element, Entry>();
  let frameHandle: number | null = null;
  let timerHandle: unknown = null;
  let asleep = false;
  let watch: VisibilityWatch | null | undefined;

  const schedule = () => {
    if (timerHandle !== null) {
      env.clearTimer(timerHandle);
      timerHandle = null;
    }
    if (frameHandle !== null) return;
    // Asleep, a mascot still gets its first frame: its face is drawn by the frame, not by its markup.
    if (asleep) {
      for (const entry of entries) if (entry.onScreen && !entry.painted) { frameHandle = env.requestFrame(run); return; }
      return;
    }
    let next = Infinity;
    for (const entry of entries) if (entry.onScreen && entry.due < next) next = entry.due;
    if (next === Infinity) return;
    const wait = next - env.now() - FRAME_SLACK_MS;
    if (wait <= FULL_FRAME_MS) {
      frameHandle = env.requestFrame(run);
      return;
    }
    timerHandle = env.setTimer(() => {
      timerHandle = null;
      if (frameHandle === null && !asleep && entries.size) frameHandle = env.requestFrame(run);
    }, wait - TIMER_LEAD_MS);
  };

  const draw = (entry: Entry, now: number) => {
    let due = Infinity;
    entry.painted = true;
    try {
      due = entry.frame(now);
    } finally {
      entry.due = due;
    }
  };

  const run = (now: number) => {
    frameHandle = null;
    try {
      for (const entry of entries) if (entry.onScreen && (asleep ? !entry.painted : entry.due <= now + FRAME_SLACK_MS)) draw(entry, now);
    } finally {
      schedule();
    }
  };

  const start = () => {
    asleep = env.asleep();
    env.onAsleepChange(() => {
      asleep = env.asleep();
      if (!asleep) return schedule();
      if (frameHandle !== null) env.cancelFrame(frameHandle);
      if (timerHandle !== null) env.clearTimer(timerHandle);
      frameHandle = null;
      timerHandle = null;
    });
    watch = env.watchVisibility((changes) => {
      for (const change of changes) {
        const entry = byElement.get(change.target);
        if (entry) entry.onScreen = change.isIntersecting;
      }
      schedule();
    });
  };

  return {
    add(frame, element) {
      if (watch === undefined) start();
      const entry: Entry = { frame, due: -Infinity, onScreen: true, painted: false };
      entries.add(entry);
      if (element && watch) {
        byElement.set(element, entry);
        watch.observe(element);
      }
      schedule();
      return {
        wake(by = -Infinity) {
          if (!entries.has(entry)) return;
          entry.due = Math.min(entry.due, by);
          schedule();
        },
        remove() {
          entries.delete(entry);
          if (element && byElement.get(element) === entry) {
            byElement.delete(element);
            watch?.unobserve(element);
          }
        },
      };
    },
    pending() {
      let count = 0;
      for (const entry of entries) if (entry.onScreen && entry.due !== Infinity) count++;
      return count;
    },
  };
}

function browserEnvironment(): ClockEnvironment {
  return {
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    watchVisibility: (onChange) => typeof IntersectionObserver === "function"
      ? new IntersectionObserver(onChange, { rootMargin: "64px" })
      : null,
    asleep: () => document.visibilityState === "hidden" || !windowFocused(),
    onAsleepChange: (listener) => {
      document.addEventListener("visibilitychange", listener);
      onWindowFocusChange(listener);
    },
  };
}

let shared: MascotClock | undefined;

export function mascotClock(): MascotClock {
  shared ??= createMascotClock(browserEnvironment());
  return shared;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = globalThis.window?.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

const readReducedMotion = () => globalThis.window?.matchMedia?.(REDUCED_MOTION).matches ?? false;

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
}
