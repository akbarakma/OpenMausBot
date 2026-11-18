import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialState, type AppState, type Bot } from "@/state/store";

const fixture = vi.hoisted(() => ({ advanced: false, state: {} as Partial<AppState> }));
vi.mock("@/lib/interface-mode", async (original) => ({
  ...await original<typeof import("@/lib/interface-mode")>(),
  useAdvancedMode: () => fixture.advanced,
}));
vi.mock("@/lib/thread-preferences", () => ({ useShowThreads: () => true }));
vi.mock("@/lib/use-owner-or-admin", () => ({ useOwnerOrAdmin: () => true }));
vi.mock("./DesktopCapabilities", () => ({ useDesktopCapabilities: () => ({}) }));
vi.mock("react-dom", () => ({ createPortal: (node: ReactNode) => node }));
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, useStore: () => ({ state: { ...original.initialState, ...fixture.state }, dispatch: vi.fn() }) };
});

import { BotListItem, botRowProps } from "./Sidebar";

const mira: Bot = {
  id: "mira", threadId: "main", name: "Mira", title: "Email Triage", description: "",
  notifications: true, color: "pink", unread: true, busy: true, activity: "waiting-on-you",
  modelSelection: { instanceId: "fake", model: "test" }, messages: [],
  tasks: [
    { threadId: "main", title: "Main Chat", createdAt: 1 },
    { threadId: "run-1", title: "Gmail new-mail triage", createdAt: 2, routineRunId: "run-1", busy: true, activity: "working" },
    { threadId: "run-2", title: "Gmail new-mail triage", createdAt: 3, routineRunId: "run-2", busy: true, activity: "working" },
    { threadId: "job", title: "Check the invoices", createdAt: 4, routineRunId: "work:job", busy: true, activity: "waiting-on-you" },
    { threadId: "old", title: "Old thread", createdAt: 5, unread: true },
  ],
};

beforeEach(() => {
  fixture.state = { bots: [mira], selectedId: "other-bot", activeView: "chat" };
  vi.stubGlobal("window", { innerWidth: 1024, innerHeight: 768 });
  vi.stubGlobal("document", { body: {} });
  vi.stubGlobal("HTMLInputElement", class {});
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("one chat per bot", () => {
  it.each([false, true])("lists nothing under a bot row while its automations and side jobs run (advanced: %s)", (advanced) => {
    fixture.advanced = advanced;
    const markup = renderToStaticMarkup(createElement(BotListItem, botRowProps({ ...initialState, ...fixture.state }, vi.fn(), mira, { density: "comfortable", query: "", onMenu: vi.fn() })));
    expect(markup).toContain("Mira");
    expect(markup).not.toContain("data-sidebar-bot-activity");
    expect(markup).not.toContain("data-sidebar-activity-row");
  });
});
