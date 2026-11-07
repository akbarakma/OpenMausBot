import { useEffect, useState, useSyncExternalStore } from "react";

import type { BrowserSignIn } from "../BrowserPanel";

export interface BrowserWindowRequest {
  botId: string;
  signIn?: BrowserSignIn;
}

let current: BrowserWindowRequest | null = null;
const watchers = new Set<() => void>();

const emit = () => {
  for (const watch of Array.from(watchers)) watch();
};

export function openBrowserWindow(botId: string, signIn?: BrowserSignIn): void {
  current = signIn ? { botId, signIn } : { botId };
  emit();
}

export function closeBrowserWindow(): void {
  if (!current) return;
  current = null;
  emit();
}

function subscribe(watch: () => void) {
  watchers.add(watch);
  return () => {
    watchers.delete(watch);
  };
}

const snapshot = () => current;

export function useBrowserWindow(): BrowserWindowRequest | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// The server hands a person's hold back to the bot 2 minutes after their last view of its browser closes
// (HOLD_LIMITS.graceMs in server/browser/hold.ts), and any view of theirs that opens stops that clock, the watch-only
// card's too. So the card stays away from a browser the person still held when they closed the window.
export const HOLD_GRACE_MS = 2 * 60_000;
const graceEnds = new Map<string, number>();

/** The full window closed; `held` when the person still held the bot's browser. */
export function browserWindowClosed(botId: string, held: boolean): void {
  if (held) graceEnds.set(botId, Date.now() + HOLD_GRACE_MS);
  else if (!graceEnds.delete(botId)) return;
  emit();
}

/** True while the person's hold, left when they closed the window, may still be running out on the server. */
export function useHoldGrace(botId: string): boolean {
  const ends = useSyncExternalStore(subscribe, () => graceEnds.get(botId) ?? 0, () => 0);
  const [, setExpired] = useState(0);
  useEffect(() => {
    const wait = ends - Date.now();
    if (wait <= 0) return;
    const timer = setTimeout(() => setExpired(ends), wait);
    return () => clearTimeout(timer);
  }, [ends]);
  return ends > Date.now();
}
