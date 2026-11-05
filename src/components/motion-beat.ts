import { useEffect, useState } from "react";

import type { MausMotion } from "@/lib/mascot";
import { MOTION_FACE_MS } from "./Avatar";

type Beat = { kind: Exclude<MausMotion, "none">; at: number } | null | undefined;

/** The motion's kind for MOTION_FACE_MS after it fires, then null: the store keeps the last motion for good. */
export function useMotionBeat(motion: Beat): Exclude<MausMotion, "none"> | null {
  const end = motion ? motion.at + MOTION_FACE_MS : 0;
  const [, expire] = useState(0);
  useEffect(() => {
    const left = end - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(() => expire((n) => n + 1), left);
    return () => clearTimeout(timer);
  }, [end]);
  return motion && end > Date.now() ? motion.kind : null;
}
