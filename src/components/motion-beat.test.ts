import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MOTION_FACE_MS } from "./Avatar";
import { useMotionBeat } from "./motion-beat";

function Probe({ at }: { at: number }) {
  return useMotionBeat({ kind: "switch", at }) ?? "rest";
}

const beat = (agoMs: number) => renderToStaticMarkup(createElement(Probe, { at: Date.now() - agoMs }));

describe("useMotionBeat", () => {
  it("plays a motion for MOTION_FACE_MS after it fires, then rests even though the store keeps it", () => {
    expect(beat(0)).toBe("switch");
    expect(beat(MOTION_FACE_MS - 200)).toBe("switch");
    expect(beat(MOTION_FACE_MS + 1)).toBe("rest");
    expect(beat(60 * 60 * 1000)).toBe("rest");
  });
});
