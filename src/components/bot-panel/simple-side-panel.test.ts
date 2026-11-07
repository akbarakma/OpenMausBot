import { describe, expect, it } from "vitest";

import type { Bot } from "@/state/store";
import { botPanelWanted, browsingNow, computerRoute, setBotPanelWanted } from "./simple-side-panel";

const memory = () => {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); } };
};

describe("the Simple bot panel's open state", () => {
  it("stays open until the person closes it, and stays closed after", () => {
    const storage = memory();
    expect(botPanelWanted(storage)).toBe(true);
    setBotPanelWanted(false, storage);
    expect(botPanelWanted(storage)).toBe(false);
    setBotPanelWanted(true, storage);
    expect(botPanelWanted(storage)).toBe(true);
  });

  it("counts as open when storage cannot be read", () => {
    expect(botPanelWanted({ getItem: () => { throw new Error("blocked"); } })).toBe(true);
  });
});

describe("where a request for the computer popup lands in Simple mode", () => {
  const none = { data: false };
  it.each([
    ["the browser, for a bot on Auto", {}, "computer", none, { kind: "browser" }],
    ["the browser, for a bot that works in it", { computer: "browser" }, "computer", none, { kind: "browser" }],
    ["the popup, for a bot with its browser off", { browser: false }, "browser", none, { kind: "popup" }],
    ["the popup, for a screen place", { computer: "cloud" }, "computer", none, { kind: "popup" }],
    ["the browser, for a screen place asked for its browser", { computer: "local" }, "browser", none, { kind: "browser" }],
    ["the Data page", {}, "data", none, { kind: "page", page: "data" }],
    ["the Files page", { computer: "cloud" }, "files", none, { kind: "page", page: "files" }],
    ["the Data page, for a data result", {}, "browser", { data: true }, { kind: "page", page: "data" }],
    ["the browser, for a sign-in there", { computer: "cloud" }, "computer", { data: false, signInPlace: "browser" }, { kind: "browser" }],
    ["the popup, for a sign-in on a screen", {}, "browser", { data: false, signInPlace: "cloud" }, { kind: "popup" }],
  ] as const)("goes to %s", (_name, bot, view, focus, route) => {
    expect(computerRoute(bot, view, focus)).toEqual(route);
  });
});

describe("whether the bot is browsing", () => {
  const call = (name: string, at: number) => ({ id: `${name}-${at}`, role: "bot", kind: "activity", at, tool: { name } }) as Bot["messages"][number];

  it("is true only once this turn has called a browser tool", () => {
    expect(browsingNow({ busy: true, turnStartedAt: 100, messages: [call("Write", 120)] })).toBe(false);
    expect(browsingNow({ busy: true, turnStartedAt: 100, messages: [call("mcp__browser__navigate", 90), call("Write", 120)] })).toBe(false);
    for (const name of ["mcp__browser__navigate", "agent_browser_click", "browser_snapshot"]) {
      expect(browsingNow({ busy: true, turnStartedAt: 100, messages: [call(name, 120)] }), name).toBe(true);
    }
  });

  it("sees a browser call a code-mode execute ran, once its output lists it", () => {
    const execute = (inner: string | null) => ({ id: "x", role: "bot", kind: "activity", at: 120, tool: { name: "execute", ...(inner ? { output: JSON.stringify({ metadata: { toolCalls: [{ tool: inner, status: "completed" }] } }, null, 2) } : {}) } }) as Bot["messages"][number];
    expect(browsingNow({ busy: true, turnStartedAt: 100, messages: [execute(null)] })).toBe(false);
    expect(browsingNow({ busy: true, turnStartedAt: 100, messages: [execute("files.read")] })).toBe(false);
    expect(browsingNow({ busy: true, turnStartedAt: 100, messages: [execute("browser.agent_browser_open")] })).toBe(true);
  });

  it("is false once the turn ends", () => {
    expect(browsingNow({ busy: false, turnStartedAt: 100, messages: [call("mcp__browser__navigate", 120)] })).toBe(false);
    expect(browsingNow({ busy: true, turnStartedAt: null, messages: [call("mcp__browser__navigate", 120)] })).toBe(false);
  });
});
