const listeners = new Set<() => void>();
let focused = true;
let started = false;
let poll: ReturnType<typeof setInterval> | undefined;

function set(next: boolean) {
  if (next === focused) return;
  focused = next;
  for (const listener of listeners) listener();
}

function check() {
  clearInterval(poll);
  poll = undefined;
  // document.hasFocus() stays true while one of our iframes has focus, but leaving the app from inside one fires no
  // blur on this window, so poll until focus comes back to this document.
  const next = document.hasFocus();
  if (next && document.activeElement instanceof HTMLIFrameElement) poll = setInterval(check, 1000);
  set(next);
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  focused = document.hasFocus();
  // Electron 43 reports document.hasFocus() as true after a reload in a window that is not focused, so the desktop
  // app asks its window instead.
  const controls = window.ogb?.windowControls;
  if (controls?.onFocusChanged) {
    controls.onFocusChanged(set);
    void controls.state().then((state) => { if (typeof state.focused === "boolean") set(state.focused); }).catch(() => undefined);
    return;
  }
  window.addEventListener("focus", check);
  // Focus moving into an iframe blurs this window first; hasFocus() reads true only once the move has finished.
  window.addEventListener("blur", () => setTimeout(check, 0));
}

/** Whether the app window has the system focus, counting focus inside its own iframes. */
export function windowFocused(): boolean {
  start();
  return focused;
}

export function onWindowFocusChange(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const PAUSED = "data-unfocused-paused";

function pauseIfLoop(animation: Animation) {
  if (!("animationName" in animation) || animation.effect?.getComputedTiming().iterations !== Infinity) return;
  const target = (animation.effect as KeyframeEffect).target;
  target?.setAttribute(PAUSED, "");
}

/**
 * Pauses every endless CSS animation while the window is not focused, so a window left open beside other apps stops
 * redrawing itself every frame. One-shot animations run on, so nothing freezes halfway through a fade-in.
 */
export function pauseLoopsWhileUnfocused(): () => void {
  const sync = () => {
    if (windowFocused()) {
      for (const element of document.querySelectorAll(`[${PAUSED}]`)) element.removeAttribute(PAUSED);
      return;
    }
    for (const animation of document.getAnimations()) pauseIfLoop(animation);
  };
  const onStart = (event: Event) => {
    if (windowFocused() || !(event.target instanceof Element)) return;
    for (const animation of event.target.getAnimations({ subtree: true })) pauseIfLoop(animation);
  };
  document.addEventListener("animationstart", onStart, true);
  const stop = onWindowFocusChange(sync);
  sync();
  return () => {
    stop();
    document.removeEventListener("animationstart", onStart, true);
  };
}
