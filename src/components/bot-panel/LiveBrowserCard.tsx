import { Globe, Loader2, Moon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { browserStreamAccess, createPreviewStreamClient } from "@/lib/browser-stream-client";
import { createLiveStreamClient, type LiveResume } from "@/lib/browser-stream-v1";
import { usePageVisible } from "@/lib/page-visible";
import { browserScope, withBrowserScope } from "@/lib/team-browser";
import { api, useStore, type Bot } from "@/state/store";
import { StreamSurface, type SurfaceConnect } from "../browser/StreamSurface";

const ignoreInput = () => undefined;
// bb-1 sends two frames per ack, so this holds the tile near 5 frames a second.
const TILE_ACK_MS = 400;

/**
 * A small, watch-only copy of the bot's browser: the same stream the full browser shows, scaled into the card. It
 * never sends its size or input, so the bot's page keeps the size the full browser gave it.
 */
export function LiveBrowserCard({ bot }: { bot: Bot }) {
  const { state } = useStore();
  const [fallback, setFallback] = useState(false);
  const [connected, setConnected] = useState(false);
  const [painted, setPainted] = useState(false);
  const [asleep, setAsleep] = useState(false);
  const [gone, setGone] = useState(false);
  const resume = useRef<LiveResume>({ viewer: "" });
  const stream = state.config?.browserEngine?.engine === "chrome" && !fallback;
  const scopedThread = browserScope(state.config?.team, bot.threadId).threadId;
  const visible = usePageVisible();
  // Hiding the page unmounts the stream without a disconnect event, so the card would come back with no loading screen.
  useEffect(() => {
    if (visible) return;
    setConnected(false);
    setPainted(false);
  }, [visible]);

  const connect = useCallback<SurfaceConnect>(({ maxWidth, maxHeight }, events) => {
    const scope: Record<string, string> = scopedThread ? { threadId: scopedThread } : {};
    if (stream) return createPreviewStreamClient({ access: browserStreamAccess(bot.id, window.location, scope), maxWidth, maxHeight }, events);
    return createLiveStreamClient(bot.id, events, (body, viewerId) => api(withBrowserScope(`/api/bots/${encodeURIComponent(bot.id)}/browser/action`, scope), {
      method: "POST", body: JSON.stringify({ ...body, viewerId }), timeoutMs: 120_000,
    }), resume.current, scope, null, TILE_ACK_MS);
  }, [bot.id, scopedThread, stream]);

  const onMessage = useCallback((message: Readonly<Record<string, unknown>>) => {
    if (message.type === "asleep" || message.type === "awake") setAsleep(message.type === "asleep");
  }, []);

  const waiting = asleep || gone || !connected || !painted;
  return (
    <div className="relative flex size-full flex-col" inert>
      {visible && (
        <StreamSurface
          key={`${stream ? "stream" : "live"}:${bot.browserProfile ?? ""}:${scopedThread ?? ""}`}
          passive
          connect={connect}
          input={ignoreInput}
          onMessage={onMessage}
          onConnectedChange={(next) => { setConnected(next); if (next) setGone(false); else setPainted(false); }}
          onFirstFrame={() => setPainted(true)}
          onUnauthorized={() => { if (stream) setFallback(true); else setGone(true); }}
          onGone={() => setGone(true)}
        />
      )}
      {waiting && (
        <div className="absolute inset-0 flex items-center justify-center bg-composer text-ink-tertiary">
          {asleep ? <Moon size={16} aria-hidden="true" /> : gone ? <Globe size={16} aria-hidden="true" /> : <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}
