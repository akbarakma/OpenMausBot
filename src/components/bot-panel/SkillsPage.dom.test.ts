// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Bot } from "@/state/store";

vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, useStore: () => ({ state: original.initialState, dispatch: vi.fn() }) };
});

const { SkillsPage } = await import("./pages");
const { LibraryTab } = await import("./LibraryTab");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const bot = { id: "scout", threadId: "t1", name: "Scout", title: "", description: "", notifications: true, color: "green", unread: false, messages: [],
  modelSelection: { instanceId: "claude", model: "x" } } as unknown as Bot;
const skill = (name: string, origin: string | undefined, source: string) => ({ name, description: `${name} does things`, enabled: true, source, warnings: [], ...(origin ? { origin } : {}) });
let listed: (ReturnType<typeof skill> & { listed?: boolean })[] = [];
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  listed = [
    skill("browser-web-search", undefined, "learn:automatic review of this conversation"),
    skill("shared-notes", "imported", "/home/ada/.claude/skills"),
    skill("ask-matt", "native", "/home/ada/.claude/skills"),
    skill("tdd", "native", "/home/ada/.claude/skills"),
  ];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("/skills")
    ? new Response(JSON.stringify({ skills: listed }), { status: 200, headers: { "content-type": "application/json" } })
    : new Response(JSON.stringify({ error: "not here" }), { status: 404, headers: { "content-type": "application/json" } })));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); });
const rows = (card: string) => [...host.querySelectorAll(`[data-panel-card="${card}"] [data-panel-row^="skill:"]`)].map((row) => row.getAttribute("data-panel-row"));

function Skills() {
  const [detail, setDetail] = useState<string | null>(null);
  return createElement(SkillsPage, { bot, derived: {} as never, detail, onDetail: setDetail });
}

it("puts the skills the bot can switch on top, and folds the global ones below with no switch", async () => {
  await act(async () => root.render(createElement(Skills)));
  await settle();
  expect(rows("own-skills")).toEqual(["skill:browser-web-search", "skill:shared-notes"]);
  const toggle = host.querySelector<HTMLButtonElement>('[data-panel-action="toggle-global-skills"]')!;
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(toggle.textContent).toContain("2");
  expect(toggle.textContent).toContain("Scout loads these on its own.");
  expect(toggle.textContent).not.toContain(".claude/skills");
  expect(rows("global-skills")).toEqual([]);

  await act(async () => toggle.click());
  expect(rows("global-skills")).toEqual(["skill:ask-matt", "skill:tdd"]);
  const global = host.querySelector('[data-panel-card="global-skills"]')!;
  expect(global.querySelector('[role="switch"], input[type="checkbox"]')).toBeNull();
  expect(global.textContent).toContain("Always on");
});

it("opens a global skill as read-only, with its folder and no Remove", async () => {
  await act(async () => root.render(createElement(Skills)));
  await settle();
  await act(async () => host.querySelector<HTMLButtonElement>('[data-panel-action="toggle-global-skills"]')!.click());
  await act(async () => host.querySelector<HTMLButtonElement>('[data-panel-open="skill:ask-matt"]')!.click());
  expect(host.textContent).toContain("Scout loads this on its own");
  expect(host.textContent).toContain("~/.claude/skills/ask-matt");
  expect(host.querySelector('[role="switch"], input[type="checkbox"]')).toBeNull();
  expect(host.querySelector('[data-panel-action^="remove-skill:"]')).toBeNull();
});

it("keeps the switch but not Remove on a skill from this computer, and both on a learned one", async () => {
  await act(async () => root.render(createElement(Skills)));
  await settle();
  await act(async () => host.querySelector<HTMLButtonElement>('[data-panel-open="skill:shared-notes"]')!.click());
  expect(host.querySelector('[role="switch"], input[type="checkbox"]')).not.toBeNull();
  expect(host.querySelector('[data-panel-action^="remove-skill:"]')).toBeNull();

  act(() => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(createElement(Skills)));
  await settle();
  await act(async () => host.querySelector<HTMLButtonElement>('[data-panel-open="skill:browser-web-search"]')!.click());
  expect(host.querySelector('[role="switch"], input[type="checkbox"]')).not.toBeNull();
  expect(host.querySelector('[data-panel-action="remove-skill:browser-web-search"]')).not.toBeNull();
});

it("says the bot has learned nothing yet, and hides the global section when there is none", async () => {
  listed = [skill("ask-matt", "native", "/home/ada/.claude/skills")];
  await act(async () => root.render(createElement(Skills)));
  await settle();
  expect(host.querySelector('[data-panel-card="own-skills"]')!.textContent).toContain("Scout hasn't learned any skills yet.");
  listed = [];
  act(() => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(createElement(Skills)));
  await settle();
  expect(host.querySelector('[data-panel-card="global-skills"]')).toBeNull();
});

it("counts only the bot's own switched-on skills on the panel's Skills row", async () => {
  await act(async () => root.render(createElement(LibraryTab, { bot, onOpen: () => {} })));
  await settle();
  expect(host.querySelector('[data-panel-page="skills"]')?.textContent).toContain("2");
  listed = listed.filter((entry) => entry.origin === "native");
  act(() => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(createElement(LibraryTab, { bot, onOpen: () => {} })));
  await settle();
  expect(host.querySelector('[data-panel-page="skills"]')?.textContent).toContain("None");
});

it("shows a skill from this computer that is on but not in the bot's list as off, found when a task needs it", async () => {
  listed = [skill("browser-web-search", undefined, "learn:automatic review of this conversation"), { ...skill("shared-notes", "imported", "/home/ada/.claude/skills"), listed: false }];
  await act(async () => root.render(createElement(Skills)));
  await settle();
  const switchOf = (name: string) => host.querySelector(`[data-panel-row="skill:${name}"] [role="switch"]`)!.getAttribute("aria-checked");
  expect(switchOf("shared-notes")).toBe("false");
  expect(switchOf("browser-web-search")).toBe("true");
  await act(async () => host.querySelector<HTMLButtonElement>('[data-panel-open="skill:shared-notes"]')!.click());
  expect(switchOf("shared-notes")).toBe("false");
  expect(host.querySelector("[data-skill-unlisted]")?.textContent).toBe("Not in this bot's list. It finds this skill when a task needs it.");

  act(() => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(createElement(LibraryTab, { bot, onOpen: () => {} })));
  await settle();
  expect(host.querySelector('[data-panel-page="skills"]')?.textContent).toContain("1");
});

it("lists the skills again when the bot moves to another conversation", async () => {
  await act(async () => root.render(createElement(SkillsPage, { bot, derived: {} as never, detail: null, onDetail: () => {} })));
  await settle();
  const calls = vi.mocked(fetch).mock.calls.length;
  listed = [skill("repo-skill", "native", "/srv/repo/.claude/skills")];
  await act(async () => root.render(createElement(SkillsPage, { bot: { ...bot, threadId: "t2" }, derived: {} as never, detail: null, onDetail: () => {} })));
  await settle();
  expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(calls);
  await act(async () => host.querySelector<HTMLButtonElement>('[data-panel-action="toggle-global-skills"]')!.click());
  expect(rows("global-skills")).toEqual(["skill:repo-skill"]);
});
