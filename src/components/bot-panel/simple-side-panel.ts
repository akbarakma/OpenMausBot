import { useEffect, useState } from "react";

import { readComputerPanelView, writeComputerPanelView, type ComputerPanelView } from "@/lib/computer-panel-view";
import { currentTaskBot, type Action, type AppState, type Bot } from "@/state/store";
import { toolSurfaceKind } from "../../../shared/tool-surface";
import type { Surface } from "../../../shared/wire";
import { openBrowserWindow, useBrowserWindow } from "./browser-window";
import { openBotSettings } from "./panel-link";

const WANTED_KEY = "omb-personal-bot-panel";

/** Whether the person last left the bot panel open; only its ✕ or the header pill says no. */
export function botPanelWanted(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try {
    return storage.getItem(WANTED_KEY) !== "closed";
  } catch {
    return true;
  }
}

export function setBotPanelWanted(open: boolean, storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(WANTED_KEY, open ? "open" : "closed");
  } catch {
  }
}

// A code-mode `execute` call names the tools it ran only in its output, as "server.tool", once it ends.
const WRAPPED_TOOL = /"tool":\s*"([^"]+)"/g;

function callsBrowser(tool: { name: string; output?: string }): boolean {
  if (toolSurfaceKind(tool.name) === "browser") return true;
  for (const [, inner] of tool.output?.matchAll(WRAPPED_TOOL) ?? []) if (toolSurfaceKind(inner.replace(".", "__")) === "browser") return true;
  return false;
}

/** Whether the bot's current turn has called a browser tool, so its live view shows what it is doing. */
export function browsingNow(bot: Pick<Bot, "busy" | "turnStartedAt" | "messages">): boolean {
  const start = bot.turnStartedAt;
  if (!bot.busy || start == null) return false;
  return bot.messages.some((message) => message.kind === "activity" && message.at >= start && message.tool !== undefined && callsBrowser(message.tool));
}

export const BROWSING_HOLD_MS = 300_000;

// Per bot, outside the card: the card unmounts while a panel page shows, the panel is closed or another bot is selected,
// so the side panel's hook, which stays mounted, notes every bot's browsing too.
const heldUntil = new Map<string, number>();

export function noteBrowsing(botId: string, browsing: boolean): void {
  if (browsing) heldUntil.set(botId, Infinity);
  else if (heldUntil.get(botId) === Infinity) heldUntil.set(botId, Date.now() + BROWSING_HOLD_MS);
}

/** True while the bot browses and for five minutes after, so the page it ended on stays up while its answer is read. */
export function useBrowsingHeld(botId: string, browsing: boolean): boolean {
  const [, expire] = useState(0);
  // Decided during render, not in an effect: one render without the hold unmounts the live view, and it reconnects through its loading screen.
  noteBrowsing(botId, browsing);
  const until = heldUntil.get(botId) ?? 0;
  const held = !browsing && until > Date.now();
  useEffect(() => {
    if (!held) return;
    const timer = setTimeout(() => expire((n) => n + 1), until - Date.now());
    return () => clearTimeout(timer);
  }, [held, until]);
  return browsing || held;
}

const QUIET_MS = 1_000;
let quietUntil = 0;

/** True just after the panel reopened by itself, so it leaves focus where the person was. A time window, not a flag,
 * because React runs a mount effect twice in development. */
export function openedQuietly(now = Date.now()): boolean {
  return now < quietUntil;
}

export type ComputerRoute = { kind: "popup" } | { kind: "page"; page: "data" | "files" } | { kind: "browser" };

/** Where a request for the computer popup lands in Simple mode: the browser fills the window, Data and Files are panel
 * pages, and only a screen place (this computer, cloud, private desktop) or a bot with no browser keeps the popup. */
export function computerRoute(
  bot: Pick<Bot, "computer" | "browser">,
  view: ComputerPanelView,
  focus: { data: boolean; signInPlace?: Surface },
): ComputerRoute {
  if (focus.data) return { kind: "page", page: "data" };
  if (focus.signInPlace) return focus.signInPlace === "browser" ? { kind: "browser" } : { kind: "popup" };
  if (view === "data" || view === "files") return { kind: "page", page: view };
  const screenPlace = bot.computer !== undefined && bot.computer !== "browser";
  if (bot.browser === false || (screenPlace && view !== "browser")) return { kind: "popup" };
  return { kind: "browser" };
}

export function simpleComputerRoute(state: AppState, bot: Bot): ComputerRoute {
  const data = state.dataResultFocus?.botId === bot.id && !state.dataResultFocus.consumed;
  const signIn = state.signInFocus?.botId === bot.id && !state.signInFocus.consumed ? state.signInFocus : null;
  return computerRoute(bot, readComputerPanelView(bot.id), { data, ...(signIn ? { signInPlace: signIn.place } : {}) });
}

/**
 * Simple mode's one side panel: the bot panel stays open until the person closes it, and comes back on the page it
 * showed once whatever covered it (a full page, another side panel, the browser) goes. Requests for the computer popup
 * and the Activity panel open the matching panel page or the full-window browser instead.
 */
export function useSimpleSidePanel({ active, bot, state, dispatch, inline, covered }: {
  active: boolean;
  bot: Bot | undefined;
  state: AppState;
  dispatch: (action: Action) => void;
  inline: boolean;
  covered: boolean;
}): { popup: boolean; activity: boolean } {
  const browserWindow = useBrowserWindow();
  for (const each of state.bots) noteBrowsing(each.id, browsingNow(currentTaskBot(each)));
  const route = active && bot && state.computerOpen ? simpleComputerRoute(state, bot) : null;
  const botId = bot?.id;
  const signIn = route?.kind === "browser" && state.signInFocus?.botId === botId && !state.signInFocus?.consumed ? state.signInFocus : null;

  useEffect(() => {
    if (active && state.settingsOpen) setBotPanelWanted(true);
  }, [active, state.settingsOpen]);

  useEffect(() => {
    if (!active || !botId || !state.activityOpen) return;
    dispatch({ type: "toggleActivity", open: false });
    openBotSettings(dispatch, "history", { page: "activity" });
  }, [active, botId, state.activityOpen, dispatch]);

  const routeKind = route?.kind ?? null;
  const routePage = route?.kind === "page" ? route.page : null;
  useEffect(() => {
    if (!botId || !routeKind || routeKind === "popup") return;
    writeComputerPanelView(botId, "computer");
    dispatch({ type: "toggleComputer", open: false });
    if (routePage) {
      openBotSettings(dispatch, "library", { page: routePage });
      return;
    }
    if (signIn) dispatch({ type: "signInFocusConsumed", requestId: signIn.requestId });
    openBrowserWindow(botId, signIn ? { url: signIn.url, site: signIn.site, nonce: signIn.requestId } : undefined);
  }, [botId, routeKind, routePage, signIn, dispatch]);

  const restore = active && Boolean(bot) && inline && !state.settingsOpen && !covered && !browserWindow;
  useEffect(() => {
    if (!restore || !botPanelWanted()) return;
    quietUntil = Date.now() + QUIET_MS;
    dispatch({ type: "toggleSettings", open: true });
  }, [restore, dispatch]);

  return { popup: !active || route === null || route.kind === "popup", activity: !active };
}
