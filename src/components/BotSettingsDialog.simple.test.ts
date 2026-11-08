import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Routine } from "@/lib/routines";
import type { WebhookTrigger } from "../../shared/webhooks";
import type { MemoryDoc } from "@/lib/memory";
import type { Bot, BotSettingsSection, InstanceInfo } from "@/state/store";
import { AVATAR_FOCUS_CENTER, AVATAR_ZOOM_MIN } from "../../shared/bot-avatar";
import type { ManagedSkill } from "./bot-settings/SkillsSection";
import type { McpServerSummary } from "@/lib/mcp-servers";
import type { BotApps } from "./bot-settings/useBotApps";

// Hook-by-call-order harness: component state survives between renders, effects never run, and handlers are read off
// the element tree.
const fixture = vi.hoisted(() => {
  vi.stubGlobal("window", { confirm: () => true });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  return {
    advanced: false,
    setAdvanced: (() => {}) as (enabled: boolean) => void,
    ownerOrAdmin: false as boolean | null,
    values: [] as unknown[],
    index: 0,
    own: 0,
    dispatch: (() => {}) as (...args: unknown[]) => void,
    api: (() => Promise.resolve({})) as (...args: unknown[]) => Promise<unknown>,
    storeState: {} as Record<string, unknown>,
    skills: {
      skills: [] as ManagedSkill[],
      loading: false,
      working: "",
      error: "",
      reviewing: null as null | { skill: ManagedSkill; text: string },
      toggle: (() => Promise.resolve()) as (skill: ManagedSkill) => Promise<void>,
      setWorking: (() => {}) as (name: string) => void,
      setError: (() => {}) as (error: string) => void,
      refresh: (() => Promise.resolve()) as () => Promise<void>,
      putAssignments: (() => Promise.resolve()) as (name: string, remove?: boolean) => Promise<void>,
    },
    memory: { docs: null as MemoryDoc[] | null, error: false, mine: false, setDoc: (() => {}) as (doc: MemoryDoc) => void, reload: () => Promise.resolve() },
    saveMemory: (() => Promise.resolve({ ok: true })) as (...args: unknown[]) => Promise<unknown>,
    openExternal: (() => Promise.resolve()) as (url: string) => Promise<void>,
    derived: {} as Record<string, unknown>,
    apps: { phase: "ready", apps: [], connectedSlugs: [] } as BotApps,
    places: {} as Record<string, [boolean, boolean, string]>,
    mcp: { servers: null as McpServerSummary[] | null, error: false },
    appTriggersLoaded: true,
  };
});
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = fixture.index++;
    if (!(index in fixture.values)) fixture.values[index] = typeof initial === "function" ? initial() : initial;
    return [fixture.values[index], (next: unknown) => {
      fixture.values[index] = typeof next === "function" ? next(fixture.values[index]) : next;
    }];
  },
  useEffect: () => {},
}));
vi.mock("@/lib/interface-mode", () => ({
  useAdvancedMode: () => fixture.advanced,
  setAdvancedMode: (enabled: boolean) => fixture.setAdvanced(enabled),
}));
vi.mock("@/lib/mcp-servers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mcp-servers")>()),
  useMcpServers: () => ({ ...fixture.mcp, refresh: () => Promise.resolve(fixture.mcp.servers ?? []) }),
}));
vi.mock("@/lib/app-triggers", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-triggers")>(),
  useAppTriggers: () => ({ loaded: fixture.appTriggersLoaded, triggers: [], attempts: [], service: null }),
}));
vi.mock("@/lib/use-owner-or-admin", () => ({ useOwnerOrAdmin: () => fixture.ownerOrAdmin }));
vi.mock("@/lib/app-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-links")>()),
  openExternalLink: (url: string) => fixture.openExternal(url),
}));
vi.mock("@/lib/memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/memory")>()),
  saveMemoryDoc: (...args: unknown[]) => fixture.saveMemory(...args),
}));
// The server renderer cannot portal; the dialog's props are what these tests read.
vi.mock("./ConfirmDialog", () => ({ ConfirmDialog: () => null }));
vi.mock("./bot-panel/LiveBrowserCard", () => ({ LiveBrowserCard: () => null }));
vi.mock("./bot-settings/useSlackManagement", () => ({ useSlackManagementUrl: () => null }));
vi.mock("./bot-settings/useBotSettingsDerived", () => ({ useBotSettingsDerived: () => fixture.derived }));
vi.mock("./DesktopCapabilities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./DesktopCapabilities")>()),
  useCaptionChrome: () => ({ padClass: "" }),
}));
vi.mock("./Avatar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./Avatar")>()),
  BotAvatar: () => null,
}));
vi.mock("./ModelPicker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ModelPicker")>()),
  ModelPicker: (props: Record<string, unknown>) => createElement("div", { "data-stub-model-picker": true, "data-thread": props.threadId, "data-contained": props.contained }),
  ModelVariantRow: () => createElement("div", { "data-stub-variants": true }),
}));
vi.mock("./bot-settings/SkillsSection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bot-settings/SkillsSection")>()),
  useManagedSkills: () => ({ ...fixture.skills, setReviewing: () => {}, enableReviewed: () => Promise.resolve() }),
}));
vi.mock("./bot-panel/use-memory-doc", () => ({ useMemoryDoc: () => fixture.memory }));
vi.mock("./PlaceChip", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./PlaceChip")>()),
  usePlaceViews: () => Object.fromEntries(Object.entries(fixture.places).map(([place, [policy, reachable, short]]) =>
    [place, { policy, reachable, view: { state: reachable ? "ready" : "blocked", params: {}, short, line: `${short}.`, action: null } }])),
}));
vi.mock("./bot-settings/useBotApps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bot-settings/useBotApps")>()),
  useBotApps: () => fixture.apps,
}));
vi.mock("@/state/store", async (importOriginal) => {
  const store = await importOriginal<typeof import("@/state/store")>();
  return {
    ...store,
    api: (...args: unknown[]) => fixture.api(...args),
    useStore: () => ({
      state: { ...store.initialState, ...fixture.storeState },
      dispatch: fixture.dispatch,
      flushBotPatches: () => Promise.resolve(),
    }),
  };
});

const { BotSettingsDialog } = await import("./BotSettingsDialog");
const { BotPanel } = await import("./bot-panel/PanelShell");
const { PanelHero } = await import("./bot-panel/PanelHero");
const { AvatarEditorCard } = await import("./bot-panel/AvatarEditorCard");
const { PanelHome } = await import("./bot-panel/PanelHome");
const { chatFolder, KnowsCard } = await import("./bot-panel/LibraryTab");
const { BotConversations } = await import("./bot-panel/Conversations");
const { SettingsPage } = await import("./bot-panel/SettingsPage");
const { ApprovalChip } = await import("./ComposerPlusMenu");
const { callMode, setCallMode } = await import("@/lib/call-mode");
const { ComputerCard, WherePage } = await import("./bot-panel/ComputerTab");
const { PageBody, AppsPage, MemoryPage, SkillsPage, FolderPage, BrowserPage } = await import("./bot-panel/pages");
const { AutomationsPage } = await import("./bot-panel/AutomationsPage");
const { BrowserLogins } = await import("./bot-panel/browser-logins");
const { memoryNoteKey, panelMemoryNotes } = await import("./bot-panel/memory-notes");
const { sectionTarget } = await import("./bot-panel/page-registry");
const { openBotSettings } = await import("./bot-panel/panel-link");
const { PageHeader } = await import("./bot-panel/rows");
const { ChatShareMenu } = await import("./ChatMoreMenu");
const { SoulField } = await import("./SoulField");
const { LocalComputerAutoWarning } = await import("./LocalComputerAutoWarning");
const { ModelPicker } = await import("./ModelPicker");
const { ThreadModelsLine } = await import("./ThreadModelsLine");
const { ModelSection } = await import("./bot-settings/ModelSection");
const { SignedInSites } = await import("./SignedInSites");
const { AvatarImageGenerator } = await import("./AvatarImageGenerator");
const { AvatarFraming } = await import("./avatar-editing");
const { MascotFaceColorPicker } = await import("./MascotFaceColorPicker");
const { Switch } = await import("./SettingsPrimitives");
const { ConfirmDialog } = await import("./ConfirmDialog");

afterAll(() => vi.unstubAllGlobals());

type Node = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
type Rendered = { html: string; nodes: Node[] };
function nodes(value: ReactNode): Node[] {
  return Children.toArray(value).flatMap((child) => {
    if (!isValidElement(child)) return [];
    const node = child as Node;
    return [node, ...nodes(node.props.children), ...nodes(node.props.action as ReactNode), ...nodes(node.props.extra as ReactNode), ...nodes(node.props.label as ReactNode), ...nodes(node.props.hint as ReactNode)];
  });
}

function makeBot(extra: Partial<Bot> = {}): Bot {
  return {
    id: "scout", threadId: "thread-scout", name: "Scout", title: "Researcher", description: "", soul: "Be brief.",
    notifications: true, color: "green", unread: false, messages: [],
    modelSelection: { instanceId: "claude", model: "claude-opus-5-5" },
    ...extra,
  };
}

function capture(component: () => ReactNode): Rendered {
  fixture.values.length = Math.min(fixture.values.length, fixture.own);
  let tree: ReactNode = null;
  function Capture() {
    fixture.index = 0;
    tree = component();
    fixture.own = fixture.index;
    return tree;
  }
  const html = renderToStaticMarkup(createElement(Capture));
  return { html, nodes: nodes(tree) };
}

const fresh = () => {
  fixture.values = [];
  fixture.own = 0;
};
const patch = vi.fn();
const onOpen = vi.fn();
const onClose = vi.fn();
const onEditInstructions = vi.fn();
const derived = () => fixture.derived as never;
const panel = (bot: Bot, linkedSection: BotSettingsSection | null = null) =>
  capture(() => BotPanel({ bot, derived: derived(), linkedSection, onClose }));
const dialog = (bot: Bot) => capture(() => BotSettingsDialog({ bot }));
const home = (bot: Bot) => capture(() => PanelHome({ bot, onOpen }));
const knows = (bot: Bot) => capture(() => KnowsCard({ bot, onOpen, onData: vi.fn(), folder: chatFolder(bot) }));
const settingsPage = (bot: Bot, editingInstructions = false) =>
  capture(() => SettingsPage({ bot, derived: derived(), onOpen, editingInstructions, onEditInstructions }));
const computer = (bot: Bot) => capture(() => ComputerCard({ bot, onOpen }));
const browserOn = { config: { features: { browser: true }, browserEngine: { kind: "engine" } } };
const find = (rendered: { nodes: Node[] }, attr: string, value: unknown = true) => {
  const found = rendered.nodes.find((node) => node.props[attr] === value);
  if (!found) throw new Error(`no node with ${attr}=${String(value)}`);
  return found;
};
const segment = (rendered: { nodes: Node[] }, attr: string) => {
  const found = rendered.nodes.find((node) => node.props.attr === attr);
  if (!found) throw new Error(`no segmented control ${attr}`);
  return found.props as { value: unknown; onChange: (value: string) => void; options: Array<{ value: string; label: unknown; disabled?: boolean }> };
};
const has = (rendered: { nodes: Node[] }, attr: string, value: unknown = true) => rendered.nodes.some((node) => node.props[attr] === value);
const ofType = (rendered: { nodes: Node[] }, type: unknown) => rendered.nodes.find((node) => node.type === type);
const click = (node: Node) => (node.props.onClick as () => void)();
const change = (node: Node, value: string) => (node.props.onChange as (event: unknown) => void)({ target: { value } });
const submit = (node: Node) => (node.props.onSubmit as (event: unknown) => void)({ preventDefault: () => {} });
const key = (node: Node, name: string) => {
  const event = { key: name, defaultPrevented: false, target: null, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  (node.props.onKeyDown as (event: unknown) => void)(event);
  return event;
};
const shown = (rendered: Rendered) => rendered.nodes.find((node) => node.type === PageBody)?.props.page as string | undefined;
const rowValue = (rendered: Rendered, page: string) => find(rendered, "data-panel-page", page).props.value;
const skill = (name: string, enabled: boolean, origin?: ManagedSkill["origin"]): ManagedSkill =>
  ({ name, description: `${name} helper`, enabled, source: "github:x/y", warnings: [], ...(origin ? { origin } : {}) });
const routine = (extra: Partial<Routine> = {}): Routine => ({
  id: "r1", name: "Morning brief", prompt: "Brief me", target: "bot", botId: "scout", runOn: "maus", enabled: true,
  schedule: { type: "daily", time: "09:00", weekdays: [1, 2, 3, 4, 5] }, durationMinutes: 15,
  nextRunAt: Date.UTC(2099, 0, 5, 9), createdAt: 1, updatedAt: 1, ...extra,
});
const webhook = (extra: Partial<WebhookTrigger> = {}): WebhookTrigger => ({
  id: "w1", endpointId: "e1", name: "Release alert", prompt: "Post the release notes", botId: "scout", runOn: "maus", enabled: true,
  createdAt: 1, updatedAt: 1, deliveryCount: 0, ...extra,
});
const app = (slug: string, scope: "read" | "write" | null) => ({
  slug, label: slug[0]!.toUpperCase() + slug.slice(1), blurb: `${slug} things`, card: { logo: null, domain: null, label: slug }, scope,
});
const engine = (extra: Partial<InstanceInfo> & { capabilities?: Record<string, unknown> } = {}) => ({
  instanceId: "claude", driverKind: "claudeAgent", snapshot: { state: "available", authenticated: true },
  capabilities: { effortLevels: ["low", "medium", "high", "max"] }, ...extra,
});
const memoryDoc = (text: string): MemoryDoc => ({ path: "MEMORY.md", text, hash: "h1", exists: true });
const switches = (html: string) => html.match(/role="switch"/g)?.length ?? 0;
const pressed = (html: string, attr: string) => [...html.matchAll(new RegExp(`${attr}="([\\w-]+)" aria-pressed="true"`, "g"))].map((match) => match[1]);

beforeEach(() => {
  fixture.advanced = false;
  fixture.setAdvanced = vi.fn();
  fixture.ownerOrAdmin = false;
  fresh();
  fixture.index = 0;
  fixture.dispatch = vi.fn();
  fixture.api = vi.fn(() => Promise.resolve({}));
  fixture.saveMemory = vi.fn((_bot: unknown, path: unknown, text: unknown) => Promise.resolve({ ok: true, doc: { path, text, hash: "h2", exists: true } }));
  fixture.openExternal = vi.fn(() => Promise.resolve());
  fixture.storeState = { settingsOpen: true, botSettingsSection: "overview", botSettingsExpandAccordion: false, routinesLoadState: "ready" };
  fixture.appTriggersLoaded = true;
  fixture.skills = {
    skills: [], loading: false, working: "", error: "", reviewing: null, toggle: vi.fn(() => Promise.resolve()),
    setWorking: vi.fn(), setError: vi.fn(), refresh: vi.fn(() => Promise.resolve()), putAssignments: vi.fn(() => Promise.resolve()),
  };
  fixture.memory = { docs: null, error: false, mine: false, setDoc: vi.fn(), reload: vi.fn(() => Promise.resolve()) };
  patch.mockReset();
  onOpen.mockReset();
  onClose.mockReset();
  onEditInstructions.mockReset();
  fixture.derived = {
    patch, approvalMode: "ask", engine: engine(), trustedModesAvailable: false, activeState: "idle",
    botRoutines: [], canCoordinate: true, sectionName: "General", mascotMotion: null,
    canUseConnectedApps: true, connectedAppsConfigured: true, connectedAppsEnabled: true, browserEnabled: true,
  };
  fixture.apps = { phase: "ready", apps: [], connectedSlugs: [] };
  fixture.mcp = { servers: [], error: false };
  fixture.places = {
    cloud: [true, true, "Cloud desktop"], vm: [true, true, "Private desktop"], local: [true, true, "Your screen"], browser: [true, true, "Web pages only"],
  };
  (window as unknown as { ogb?: unknown }).ogb = undefined;
});

describe("the bot panel in Simple mode", () => {
  it("has Share, a gear for Bot settings and a close button on top, then the hero and one page with no tabs", () => {
    const bot = makeBot();
    const rendered = panel(bot);
    expect(ofType(rendered, ChatShareMenu)!.props.bot).toBe(bot);
    const gear = find(rendered, "data-panel-gear");
    expect([gear.props["aria-label"], gear.props.title]).toEqual(["Bot settings", "Bot settings"]);
    click(find(rendered, "aria-label", "Close settings"));
    expect(onClose).toHaveBeenCalled();
    const hero = ofType(rendered, PanelHero)!;
    expect(hero.props.bot).toBe(bot);
    expect(hero.props.patch).toBe(patch);
    expect(has(rendered, "role", "tablist")).toBe(false);
    expect(shown(rendered)).toBeUndefined();
    expect(ofType(rendered, PanelHome)!.props.bot).toBe(bot);
  });

  it("opens Bot settings from the gear, with Back to the bot, and its apps with Back to Bot settings", () => {
    const bot = makeBot();
    click(find(panel(bot), "data-panel-gear"));
    const settings = panel(bot);
    expect(shown(settings)).toBe("settings");
    expect(ofType(settings, PageHeader)!.props).toMatchObject({ back: "Scout", title: "Bot settings" });
    (ofType(settings, PageBody)!.props.onOpen as (page: string) => void)("apps");
    const apps = panel(bot);
    expect(ofType(apps, PageHeader)!.props).toMatchObject({ back: "Bot settings", title: "Apps it can use", intro: "Switch on the apps Scout may use. Everything else stays off." });
    (ofType(apps, PageHeader)!.props.onBack as () => void)();
    expect(shown(panel(bot))).toBe("settings");
    (ofType(panel(bot), PageHeader)!.props.onBack as () => void)();
    expect(shown(panel(bot))).toBeUndefined();
  });

  it("drills into a page with its intro and back, naming where Back goes", () => {
    const bot = makeBot();
    const openFromHome = (page: string) => (ofType(panel(bot), PanelHome)!.props.onOpen as (page: string) => void)(page);
    openFromHome("routines");
    const page = panel(bot);
    expect(shown(page)).toBe("routines");
    expect(ofType(page, PageHeader)!.props).toMatchObject({ back: "Scout", title: "Automations" });
    expect(page.html).toContain('id="bot-settings-title"');
    (ofType(page, PageHeader)!.props.onBack as () => void)();
    expect(shown(panel(bot))).toBeUndefined();

    openFromHome("memory");
    expect(ofType(panel(bot), PageHeader)!.props).toMatchObject({ back: "Scout", title: "Memories", intro: "Scout keeps these tidy on its own." });
    (ofType(panel(bot), PageBody)!.props.onDetail as (key: string) => void)("MEMORY.md:0");
    expect(ofType(panel(bot), PageHeader)!.props).toMatchObject({ back: "Memories", title: undefined, intro: undefined });
    expect(ofType(panel(bot), PageBody)!.props.detail).toBe("MEMORY.md:0");
    (ofType(panel(bot), PageHeader)!.props.onBack as () => void)();
    expect(ofType(panel(bot), PageHeader)!.props).toMatchObject({ back: "Scout", title: "Memories" });
    expect(ofType(panel(bot), PageBody)!.props.detail).toBeNull();
    (ofType(panel(bot), PageHeader)!.props.onBack as () => void)();

    for (const [id, title] of [["data", "Data"], ["files", "Files"], ["activity", "Activity"]] as const) {
      openFromHome(id);
      expect(ofType(panel(bot), PageHeader)!.props, id).toMatchObject({ back: "Scout", title });
      (ofType(panel(bot), PageHeader)!.props.onBack as () => void)();
    }
  });

  it("goes back on Escape from a page, and leaves Escape alone on the first page", () => {
    const bot = makeBot();
    (ofType(panel(bot), PanelHome)!.props.onOpen as (page: string) => void)("routines");
    const event = key(panel(bot).nodes[0]!, "Escape");
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(shown(panel(bot))).toBeUndefined();
    const onHome = key(panel(bot).nodes[0]!, "Escape");
    expect(onHome.stopPropagation).not.toHaveBeenCalled();
  });

  it("holds the Instructions editor open on Bot settings, and closes it when the panel moves on", () => {
    const bot = makeBot();
    click(find(panel(bot), "data-panel-gear"));
    expect(ofType(panel(bot), PageBody)!.props.editingInstructions).toBe(false);
    (ofType(panel(bot), PageBody)!.props.onEditInstructions as (open: boolean) => void)(true);
    expect(ofType(panel(bot), PageBody)!.props.editingInstructions).toBe(true);
    (ofType(panel(bot), PageHeader)!.props.onBack as () => void)();
    click(find(panel(bot), "data-panel-gear"));
    expect(ofType(panel(bot), PageBody)!.props.editingInstructions).toBe(false);
  });

  it("opens the avatar editor from the avatar and closes it with Escape", () => {
    const bot = makeBot();
    expect(ofType(panel(bot), AvatarEditorCard)).toBeUndefined();
    (ofType(panel(bot), PanelHero)!.props.onToggleEditor as () => void)();
    const open = panel(bot);
    const editor = ofType(open, AvatarEditorCard)!;
    expect(editor.props.onPatch).toBe(patch);
    expect(editor.props.bot).toBe(bot);
    key(open.nodes[0]!, "Escape");
    expect(ofType(panel(bot), AvatarEditorCard)).toBeUndefined();
  });

  it.each([
    ["overview", undefined], ["identity", undefined], ["slack", undefined], ["soul", "settings"], ["skills", "skills"], ["memory", "memory"],
    ["routines", "routines"], ["access", undefined], ["model", undefined], ["permissions", "settings"], ["voice", undefined],
    ["visibility", undefined], ["history", undefined], ["usage", undefined],
  ] as const)("lands a deep link to %s on page %s", (section, page) => {
    expect(sectionTarget(section).page).toBe(page);
    expect(shown(panel(makeBot(), section))).toBe(page);
  });

  it("opens Bot settings with the Instructions editor for a soul link, and scrolls Model and Before it acts into view", () => {
    expect(ofType(panel(makeBot(), "soul"), PageBody)!.props).toMatchObject({ page: "settings", editingInstructions: true });
    expect(sectionTarget("model").anchor).toBe("model");
    expect(sectionTarget("permissions")).toMatchObject({ page: "settings", anchor: "approval" });
    expect(sectionTarget("soul")).toMatchObject({ page: "settings", anchor: "instructions" });
  });

  // App tool grants (PluginsPanel) and the working folder (the files pane) name a Simple page; MCP servers live on the
  // apps page, and tool selection names none, so it lands where Access does.
  it.each([["apps", "apps"], ["folder", "folder"], ["mcp", "apps"], ["tools", undefined]] as const)("lands an Access link naming %s on %s", (page, landing) => {
    try {
      openBotSettings(fixture.dispatch, "access", { page });
      expect(shown(panel(makeBot(), "access"))).toBe(landing);
    } finally {
      // A link without a page lands where the section does: later tests see no trace of this one.
      openBotSettings(vi.fn(), "access");
    }
    fresh();
    expect(shown(panel(makeBot(), "access"))).toBeUndefined();
  });

  it("shows only the browser switch on the first page, none on Bot settings, and Bot API's on its own page", () => {
    const bot = makeBot();
    const first = panel(bot).html;
    expect(switches(first)).toBe(1);
    expect(first).toContain('aria-label="Let Bot use a browser"');
    expect(first).not.toContain('aria-label="Work until done"');
    for (const text of ["Memory", "Upkeep", "Record"]) expect(first).not.toContain(`>${text}<`);
    click(find(panel(bot), "data-panel-gear"));
    const settings = panel(bot).html;
    expect(settings).toContain('data-panel-page="botapi"');
    expect(switches(settings)).toBe(0);
    const botApi = capture(() => PageBody({ page: "botapi", bot, derived: derived() })).html;
    expect(switches(botApi)).toBe(1);
    expect(botApi).toContain('aria-label="Let apps talk to this bot"');
  });
});

describe("the hero", () => {
  const hero = (bot: Bot, editorOpen = false) =>
    capture(() => PanelHero({ bot, patch, editorOpen, onToggleEditor: vi.fn() }));

  it("labels the avatar Edit avatar and shows whether the editor is open", () => {
    const rendered = hero(makeBot(), true);
    expect(find(rendered, "data-panel-avatar").props["aria-label"]).toBe("Edit avatar");
    expect(find(rendered, "data-panel-avatar").props["aria-expanded"]).toBe(true);
    expect(rendered.html).toContain("Edit avatar");
  });

  it("renames inline: Enter saves the trimmed name, a blank name saves nothing", () => {
    const bot = makeBot();
    click(find(hero(bot), "data-panel-rename"));
    const editing = hero(bot);
    const input = find(editing, "data-panel-rename-input");
    expect(input.props.value).toBe("Scout");
    change(input, "  Nova ");
    key(find(hero(bot), "data-panel-rename-input"), "Enter");
    expect(patch).toHaveBeenLastCalledWith({ name: "Nova" });
    expect(has(hero(bot), "data-panel-rename-input")).toBe(false);

    patch.mockReset();
    click(find(hero(bot), "data-panel-rename"));
    change(find(hero(bot), "data-panel-rename-input"), "   ");
    (find(hero(bot), "data-panel-rename-input").props.onBlur as () => void)();
    expect(patch).not.toHaveBeenCalled();
  });

  it("saves a rename on blur and puts the old name back on Escape", () => {
    const bot = makeBot();
    click(find(hero(bot), "data-panel-rename"));
    change(find(hero(bot), "data-panel-rename-input"), "Atlas");
    (find(hero(bot), "data-panel-rename-input").props.onBlur as () => void)();
    expect(patch).toHaveBeenLastCalledWith({ name: "Atlas" });

    patch.mockReset();
    click(find(hero(bot), "data-panel-rename"));
    change(find(hero(bot), "data-panel-rename-input"), "Atlas");
    const input = find(hero(bot), "data-panel-rename-input");
    const event = key(input, "Escape");
    expect(event.stopPropagation).toHaveBeenCalled();
    (input.props.onBlur as () => void)();
    expect(patch).not.toHaveBeenCalled();
    expect(has(hero(bot), "data-panel-rename")).toBe(true);
  });

  it("sets the name at 17px, and shows the title line only once one is set", () => {
    expect(find(hero(makeBot()), "data-panel-rename").props.className).toContain("text-[17px]");
    const untitled = hero(makeBot({ title: "" }));
    expect(has(untitled, "data-panel-label")).toBe(false);
    expect(untitled.html).not.toContain("Add a label");
  });

  it("edits the title inline", () => {
    const bot = makeBot();
    expect(find(hero(bot), "data-panel-label").props.children).toBe("Researcher");
    click(find(hero(bot), "data-panel-label"));
    const input = find(hero(bot), "data-panel-label-input");
    expect(input.props.value).toBe("Researcher");
    change(input, "Writer");
    (find(hero(bot), "data-panel-label-input").props.onBlur as () => void)();
    expect(patch).toHaveBeenLastCalledWith({ title: "Writer" });

    click(find(hero(bot), "data-panel-label"));
    change(find(hero(bot), "data-panel-label-input"), "");
    key(find(hero(bot), "data-panel-label-input"), "Enter");
    expect(patch).toHaveBeenLastCalledWith({ title: "" });
  });
});

describe("the avatar editor", () => {
  const editor = (bot: Bot) => capture(() => AvatarEditorCard({ bot, onPatch: patch, onClose }));

  it("shows the ten bodies and twelve colors, with the Halloween bodies and the faces behind More looks", () => {
    const bot = makeBot();
    const rendered = editor(bot);
    expect(rendered.html.match(/aria-label="Use the \w+ body"/g)).toHaveLength(10);
    expect(rendered.html.match(/aria-label="Use \w+ mascot color"/g)).toHaveLength(12);
    expect(rendered.html).not.toContain(">Halloween<");
    expect(has(rendered, "data-avatar-face", "idle")).toBe(false);
    expect(find(rendered, "aria-label", "Use the Cursor body").props["aria-pressed"]).toBe(true);
    click(find(rendered, "aria-label", "Use the Blob body"));
    expect(patch).toHaveBeenLastCalledWith({ mascotBody: "blob" });
    click(find(rendered, "aria-label", "Use blue mascot color"));
    expect(patch).toHaveBeenLastCalledWith({ color: "blue" });
    expect(find(rendered, "aria-label", "Use silver mascot color").props.title).toBe("Silver");
    click(find(rendered, "aria-label", "Use silver mascot color"));
    expect(patch).toHaveBeenLastCalledWith({ color: "silver" });
    expect(find(rendered, "aria-label", "Use chrome mascot color").props.title).toBe("Chrome");
    click(find(rendered, "aria-label", "Use chrome mascot color"));
    expect(patch).toHaveBeenLastCalledWith({ color: "chrome" });

    const more = find(rendered, "data-avatar-more");
    expect(more.props["aria-expanded"]).toBe(false);
    expect(rendered.html).toContain(">More looks<");
    click(more);
    const open = editor(bot);
    expect(find(open, "data-avatar-more").props["aria-expanded"]).toBe(true);
    expect(open.html.match(/aria-label="Use the \w+ body"/g)).toHaveLength(20);
    expect(open.html).toContain(">Halloween<");
    click(find(open, "aria-label", "Use the Pumpkin body"));
    expect(patch).toHaveBeenLastCalledWith({ mascotBody: "pumpkin" });
    expect(find(open, "data-avatar-face", "auto").props["aria-pressed"]).toBe(true);
    expect(find(open, "data-avatar-face", "idle").props["aria-pressed"]).toBe(false);
    click(find(open, "data-avatar-face", "proud"));
    expect(patch).toHaveBeenLastCalledWith({ mascotExpression: "proud" });
    expect(open.html).toContain(">Proud<");
    click(find(open, "data-avatar-face", "radar"));
    expect(patch).toHaveBeenLastCalledWith({ mascotExpression: "radar" });
    expect(open.html).toContain(">Radar<");
  });

  it("marks a pinned face, and Auto removes the pin", () => {
    const pinned = editor(makeBot({ mascotExpression: "proud" }));
    expect(find(pinned, "data-avatar-face", "proud").props["aria-pressed"]).toBe(true);
    expect(find(pinned, "data-avatar-face", "auto").props["aria-pressed"]).toBe(false);
    click(find(pinned, "data-avatar-face", "auto"));
    expect(patch).toHaveBeenLastCalledWith({ mascotExpression: null });
  });

  it("opens More looks at once for a Halloween body or a chosen face", () => {
    expect(find(editor(makeBot({ mascotBody: "pumpkin" })), "data-avatar-more").props["aria-expanded"]).toBe(true);
    fresh();
    expect(find(editor(makeBot({ mascotExpression: "proud" })), "data-avatar-more").props["aria-expanded"]).toBe(true);
    fresh();
    expect(find(editor(makeBot()), "data-avatar-more").props["aria-expanded"]).toBe(false);
  });

  it("switches back to the mascot when a body is picked over a picture", () => {
    const bot = makeBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "circle" });
    click(find(editor(bot), "data-avatar-tab", "bot"));
    click(find(editor(bot), "aria-label", "Use the Star body"));
    expect(patch).toHaveBeenLastCalledWith({ mascotBody: "star", avatarCrop: "mascot" });
  });

  it("resets the mascot as the Advanced card does", () => {
    click(find(editor(makeBot()), "data-avatar-reset"));
    expect(patch).toHaveBeenLastCalledWith({ avatarCrop: "mascot", color: "green", mascotExpression: null, mascotBody: "cursor", mascotFaceColor: null });
  });

  it("edits facial feature color without changing body color or expression", () => {
    const props = ofType(editor(makeBot({ mascotFaceColor: "black" })), MascotFaceColorPicker)!.props;
    const choices = segment(capture(() => MascotFaceColorPicker(props as Parameters<typeof MascotFaceColorPicker>[0])), "data-avatar-face-color");
    expect(choices.value).toBe("black");
    expect(choices.options.map((option) => option.value)).toEqual(["white", "black"]);
    choices.onChange("white");
    expect(patch).toHaveBeenLastCalledWith({ mascotFaceColor: "white" });
  });

  it("generates with the shared generator, and uploads with shape and framing", () => {
    const bot = makeBot();
    click(find(editor(bot), "data-avatar-tab", "generate"));
    const generate = editor(bot);
    expect(ofType(generate, AvatarImageGenerator)!.props.botLabel).toBe("Researcher");

    click(find(generate, "data-avatar-tab", "upload"));
    const upload = editor(bot);
    expect(upload.html).toContain("Drop a picture here, or choose one");
    expect(upload.html).toContain("PNG, JPEG, GIF, or WebP · up to 10 MB");
    expect(segment(upload, "data-avatar-crop").options.map((option) => [option.value, option.disabled])).toEqual([
      ["circle", true], ["rounded", true], ["square", true],
    ]);
    expect(ofType(upload, AvatarFraming)).toBeUndefined();

    fresh();
    const pictured = makeBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "circle" });
    const withImage = editor(pictured);
    expect(find(withImage, "data-avatar-tab", "upload").props["aria-selected"]).toBe(true);
    expect(ofType(withImage, AvatarFraming)!.props.bot).toBe(pictured);
    expect(segment(withImage, "data-avatar-crop").value).toBe("circle");
    segment(withImage, "data-avatar-crop").onChange("square");
    expect(patch).toHaveBeenLastCalledWith({ avatarCrop: "square" });
    click(find(withImage, "aria-label", "Remove custom avatar image"));
    expect(patch).toHaveBeenLastCalledWith({ avatarUrl: null, avatarCrop: "mascot", avatarZoom: AVATAR_ZOOM_MIN, avatarFocusX: AVATAR_FOCUS_CENTER, avatarFocusY: AVATAR_FOCUS_CENTER });
  });

  it("closes on Escape without letting the dialog close settings", () => {
    const event = key(editor(makeBot()).nodes[0]!, "Escape");
    expect(onClose).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });
});


describe("the first page", () => {
  it("runs Computer, Setup, What it knows, This conversation, then the conversations, with no Thinking row", () => {
    const rendered = home(makeBot());
    expect(ofType(rendered, ModelPicker)!.props).toMatchObject({ bot: expect.objectContaining({ id: "scout" }), threadId: "thread-scout", contained: true });
    expect(ofType(rendered, BotConversations)!.props.bot).toMatchObject({ id: "scout" });
    const order = ['data-panel-card="computer"', 'data-panel-card="model"', 'data-panel-row="model"', 'data-panel-page="routines"', 'data-panel-card="keeps"',
      'data-panel-card="conversation"', 'data-panel-page="files"', 'data-panel-item="find"', 'data-panel-page="activity"']
      .map((marker) => rendered.html.indexOf(marker));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const gone of ['data-panel-row="thinking"', 'data-panel-edit="soul"', 'data-panel-row="approval"', 'data-panel-row="goal"', 'data-panel-row="call-mode"',
      'data-panel-page="apps"', 'data-panel-page="browser"', 'data-panel-tab']) {
      expect(rendered.html, gone).not.toContain(gone);
    }
  });

  it("shows Automations as one row, valued by how many of this bot's routines and webhooks are on", () => {
    const empty = home(makeBot({ defaultBot: {} }));
    expect(empty.html.match(/data-panel-page="routines"/g)).toHaveLength(1);
    expect(rowValue(empty, "routines")).toBe("None");
    click(find(empty, "data-panel-page", "routines"));
    expect(onOpen).toHaveBeenLastCalledWith("routines");
    fixture.storeState.routines = [routine(), routine({ id: "r2", enabled: false }), routine({ id: "r3", botId: "other" })];
    fixture.storeState.webhooks = [webhook(), webhook({ id: "w2", botId: "other" })];
    expect(rowValue(home(makeBot()), "routines")).toBe("2 on");
    fixture.storeState.routines = [routine({ enabled: false })];
    fixture.storeState.webhooks = [webhook({ enabled: false })];
    expect(rowValue(home(makeBot()), "routines")).toBe("None");
    fixture.appTriggersLoaded = false;
    expect(rowValue(home(makeBot()), "routines"), "app events still loading: no None yet").toBeUndefined();
  });

  it("opens Files, Activity and Data as panel pages, and keeps Find as the menu's own row", () => {
    const rendered = home(makeBot());
    expect(rowValue(rendered, "files")).toBe("None");
    for (const page of ["files", "activity"]) {
      click(find(rendered, "data-panel-page", page));
      expect(onOpen).toHaveBeenLastCalledWith(page);
    }
    const card = ofType(rendered, KnowsCard)!;
    expect(card.props).toMatchObject({ dataLabel: "computer.tab.data", folder: undefined });
    (card.props.onData as () => void)();
    expect(onOpen).toHaveBeenLastCalledWith("data");
    expect([...rendered.html.matchAll(/data-panel-item="(\w+)"/g)].map((match) => match[1])).toEqual(["find"]);
    expect(rendered.html).toContain(">Find in conversation<");
  });

  it("values Memories by the notes in MEMORY.md, says Off when memory is off, and opens the memory page", () => {
    expect(rowValue(knows(makeBot()), "memory")).toBeUndefined();
    fixture.memory.docs = [memoryDoc("# Notes\n- Likes short replies\n- Uses Resolve\n- Works nights\n")];
    const rendered = knows(makeBot());
    expect(rowValue(rendered, "memory")).toBe("3 notes");
    click(find(rendered, "data-panel-page", "memory"));
    expect(onOpen).toHaveBeenLastCalledWith("memory");
    fixture.memory.docs = [memoryDoc("- One thing\n")];
    expect(rowValue(knows(makeBot()), "memory")).toBe("1 note");
    fixture.memory.docs = [memoryDoc("# Empty\n")];
    expect(rowValue(knows(makeBot()), "memory")).toBe("Nothing yet");
    expect(rowValue(knows(makeBot({ memoryEnabled: false })), "memory")).toBe("Off");
  });

  it("values Skills by how many are on, and opens the skills page", () => {
    expect(rowValue(knows(makeBot()), "skills")).toBe("None");
    fixture.skills.skills = [skill("triage", true), skill("summarise", false), skill("deploy", true)];
    const rendered = knows(makeBot());
    expect(rowValue(rendered, "skills")).toBe(2);
    click(find(rendered, "data-panel-page", "skills"));
    expect(onOpen).toHaveBeenLastCalledWith("skills");
    fixture.skills.loading = true;
    expect(rowValue(knows(makeBot()), "skills")).toBeUndefined();
  });

  it("values Working folder by this chat's folder, else the bot's, else Private, and opens the folder page", () => {
    const rendered = knows(makeBot());
    expect(rowValue(rendered, "folder")).toBe("Private");
    click(find(rendered, "data-panel-page", "folder"));
    expect(onOpen).toHaveBeenLastCalledWith("folder");
    expect(rowValue(knows(makeBot({ cwd: "/Users/omkar/Projects/site" })), "folder")).toBe("/Users/omkar/Projects/site");
    const pinned = (cwd: string | null) => makeBot({ cwd: "/Users/omkar/Projects/site", tasks: [{ threadId: "thread-scout", title: "Main", cwd }] as Bot["tasks"] });
    expect(rowValue(knows(pinned("/Users/omkar/Projects/other")), "folder")).toBe("/Users/omkar/Projects/other");
    expect(rowValue(knows(pinned(null)), "folder")).toBe("Home folder");
  });
});

describe("the Bot settings page", () => {
  it("groups Job and Instructions under Profile, Before it acts and Apps under Rules, then Models, Calls and Advanced, with every title on one edge", () => {
    const rendered = settingsPage(makeBot({ defaultBot: {} }));
    const order = ['>Profile<', 'data-panel-row="job"', 'data-panel-edit="soul"', '>Rules<', 'data-panel-row="approval"', 'data-panel-page="apps"',
      '>Models<', 'data-panel-page="backups"', '>Calls<', 'data-panel-row="call-mode"', '>Advanced<', 'data-panel-page="botapi"', 'data-panel-row="default-bot-hide"']
      .map((marker) => rendered.html.indexOf(marker));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(switches(rendered.html)).toBe(0);
    expect(rendered.html).not.toContain('data-testid="bot-api"');
    expect(rendered.html).not.toContain("Used only when");
    expect(rendered.html).not.toContain("pl-[26px]");
    expect(rendered.html.match(/data-panel-card="default-bot"/g)).toBeNull();
  });

  it("opens Backup AIs and Bot API on their own pages, counting the backups", () => {
    expect(rowValue(settingsPage(makeBot()), "backups")).toBe("None");
    const two = settingsPage(makeBot({ fallback: [{ instanceId: "codex", model: "gpt-5.5" }, { instanceId: "gemini", model: "gemini-3" }] }));
    expect(rowValue(two, "backups")).toBe(2);
    click(find(two, "data-panel-page", "backups"));
    expect(onOpen).toHaveBeenLastCalledWith("backups");
    click(find(two, "data-panel-page", "botapi"));
    expect(onOpen).toHaveBeenLastCalledWith("botapi");
  });

  it("shows the first line of the instructions, or how to start, and edits them in place with Done", () => {
    const bot = makeBot();
    const closed = settingsPage(bot);
    expect(closed.html).toContain("Be brief.");
    expect(ofType(closed, SoulField)).toBeUndefined();
    click(find(closed, "data-panel-edit", "soul"));
    expect(onEditInstructions).toHaveBeenLastCalledWith(true);
    expect(settingsPage(makeBot({ soul: "" })).html).toContain("Tell Scout how to work for you");

    const open = settingsPage(bot, true);
    expect(ofType(open, SoulField)!.props.onPatch).toBe(patch);
    expect(has(open, "data-panel-edit", "soul")).toBe(false);
    click(find(open, "data-panel-done", "soul"));
    expect(onEditInstructions).toHaveBeenLastCalledWith(false);

    const drifted = settingsPage(makeBot({ soulDrift: true }));
    expect(ofType(drifted, SoulField)).toBeDefined();
    expect(has(drifted, "data-panel-done", "soul")).toBe(false);
  });

  it("offers Ask me first and Just do it with no hint text, and writes either for every conversation", () => {
    const rendered = settingsPage(makeBot());
    const acts = segment(rendered, "data-approval-choice");
    expect(acts.options.map((option) => [option.value, option.label])).toEqual([["ask", "Ask me first"], ["full", "Just do it"]]);
    expect(acts.value).toBe("ask");
    for (const hint of ["Checks before changes", "Acts without checking", "Acts, then tells you"]) expect(rendered.html).not.toContain(`>${hint}<`);
    acts.onChange("ask");
    expect(fixture.dispatch).not.toHaveBeenCalled();
    acts.onChange("full");
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "updateBot", botId: "scout", patch: { approvalMode: "full", applyToAllThreads: true } });
    fixture.derived.approvalMode = "full";
    const full = settingsPage(makeBot());
    expect(pressed(full.html, "data-approval-choice")).toEqual(["full"]);
    segment(full, "data-approval-choice").onChange("ask");
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "updateBot", botId: "scout", patch: { approvalMode: "ask", applyToAllThreads: true } });
    expect(patch).not.toHaveBeenCalled();
  });

  it.each([["auto", "Decide for me", undefined], ["edits", "Auto-accept edits", undefined], ["custom", "Custom", "Change this in Advanced mode"]] as const)(
    "shows a bot in %s mode as a third, selected pill it cannot pick again, beside the two choices", (mode, label, tooltip) => {
      fixture.derived.approvalMode = mode;
      const rendered = settingsPage(makeBot());
      const acts = segment(rendered, "data-approval-choice");
      expect(acts.options.map((option) => [option.value, option.label, Boolean(option.disabled)])).toEqual([["ask", "Ask me first", false], ["full", "Just do it", false], [mode, label, true]]);
      expect((acts.options[2] as { tooltip?: string }).tooltip).toBe(tooltip);
      expect(pressed(rendered.html, "data-approval-choice")).toEqual([mode]);
      acts.onChange(mode);
      expect(fixture.dispatch).not.toHaveBeenCalled();
      acts.onChange("ask");
      expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "updateBot", botId: "scout", patch: { approvalMode: "ask", applyToAllThreads: true } });
    },
  );

  it("shows legacy Antigravity Auto as Ask without a third pill or a change to the saved mode", () => {
    fixture.derived.engine = engine({ driverKind: "antigravityAgent" });
    fixture.derived.approvalMode = "auto";
    const rendered = settingsPage(makeBot({ approvalMode: "auto" }));
    expect(segment(rendered, "data-approval-choice").options).toHaveLength(2);
    expect(pressed(rendered.html, "data-approval-choice")).toEqual(["ask"]);
    expect(patch).not.toHaveBeenCalled();
  });

  it("lets the approval level change while the bot is busy and says from when", () => {
    const rendered = settingsPage(makeBot({ busy: true }));
    expect(segment(rendered, "data-approval-choice").options.some((option) => option.disabled)).toBe(false);
    expect(rendered.html).toContain("The bot is working. A change applies from its next step");
    expect(settingsPage(makeBot()).html).not.toContain("The bot is working");
  });

  it("shows the conversation's approval level, the composer's choice, only where it differs from the bot's own", () => {
    expect(has(settingsPage(makeBot()), "data-panel-row", "thread-approval")).toBe(false);
    fixture.storeState = { ...fixture.storeState, instances: [engine({ displayName: "Claude" })] };
    expect(has(settingsPage(makeBot({ tasks: [{ threadId: "thread-scout", title: "Plan", createdAt: 1, approvalMode: "ask" }] })), "data-panel-row", "thread-approval")).toBe(false);
    const rendered = settingsPage(makeBot({ tasks: [{ threadId: "thread-scout", title: "Plan", createdAt: 1, approvalMode: "full" }] }));
    expect(has(rendered, "data-panel-row", "thread-approval")).toBe(true);
    expect(rendered.html).toContain(">In this conversation<");
    const choice = ofType(rendered, ApprovalChip)!.props.choice as Parameters<typeof ApprovalChip>[0]["choice"];
    expect(choice).toMatchObject({ approvalMode: "full", providerName: "Claude", driverKind: "claudeAgent" });
    choice.onSelect("ask");
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "updateTask", botId: "scout", threadId: "thread-scout", patch: { approvalMode: "ask" } });
  });

  it("chooses the call mode, Take turns or Live", () => {
    setCallMode("turns");
    try {
      const calls = segment(settingsPage(makeBot()), "data-call-mode");
      expect(calls.options.map((option) => [option.value, option.label])).toEqual([["turns", "Take turns"], ["live", "Live"]]);
      calls.onChange("live");
      expect(callMode()).toBe("live");
    } finally {
      setCallMode("turns");
    }
  });

  it("values the Apps row with the apps switched on, or None yet, and opens the apps page", () => {
    const empty = settingsPage(makeBot());
    expect(rowValue(empty, "apps")).toBe("None yet");
    click(find(empty, "data-panel-page", "apps"));
    expect(onOpen).toHaveBeenLastCalledWith("apps");
    fixture.apps = { phase: "ready", connectedSlugs: ["gmail", "notion", "slack"], apps: [app("gmail", "write"), app("notion", null), app("slack", "read")] };
    expect(rowValue(settingsPage(makeBot()), "apps")).toBe("Gmail, Slack");
  });

  it("lists the MCP servers the bot can use after its apps, and None yet when there are neither", () => {
    fixture.mcp.servers = [{ name: "dodopayments-remote", enabled: true }, { name: "linear", enabled: true }, { name: "paused", enabled: false }];
    expect(rowValue(settingsPage(makeBot()), "apps")).toBe("dodopayments-remote, linear");
    expect(rowValue(settingsPage(makeBot({ mcpServers: ["linear"] })), "apps")).toBe("linear");
    fixture.apps = { phase: "ready", connectedSlugs: ["gmail"], apps: [app("gmail", "write")] };
    expect(rowValue(settingsPage(makeBot({ mcpServers: ["linear"] })), "apps")).toBe("Gmail, linear");
    fixture.apps = { phase: "ready", apps: [], connectedSlugs: [] };
    expect(rowValue(settingsPage(makeBot({ mcpServers: [] })), "apps")).toBe("None yet");
  });

  it("edits the bot's job: saved on blur, Enter leaves the field, Escape puts it back", () => {
    const bot = makeBot();
    const job = () => find(settingsPage(bot), "data-panel-job");
    expect(job().props).toMatchObject({ value: "Researcher", placeholder: "What it does", "aria-label": "Job" });
    change(job(), "  Writer ");
    expect(job().props.value).toBe("  Writer ");
    (job().props.onBlur as () => void)();
    expect(patch).toHaveBeenLastCalledWith({ title: "Writer" });
    expect(job().props.value).toBe("Researcher");

    patch.mockReset();
    change(job(), "Editor");
    const escape = key(job(), "Escape");
    expect(escape.stopPropagation).toHaveBeenCalled();
    expect(job().props.value).toBe("Researcher");
    (job().props.onBlur as () => void)();
    expect(patch).not.toHaveBeenCalled();
  });
});

describe("the Computer card", () => {
  it("shows no picture and nothing to open while the browser is off, then Works in and the browser switch", () => {
    const oldPage = { id: "shot", role: "bot", kind: "screen", at: 1, png: "AAAA" } as Bot["messages"][number];
    const rendered = computer(makeBot({ messages: [oldPage] }));
    expect(rendered.html).toContain(">Browser<");
    expect(rendered.html).not.toContain("Bot&#x27;s browser");
    expect(rendered.html).not.toContain("<img");
    expect(has(rendered, "data-panel-action", "open-computer")).toBe(false);
    expect(find(rendered, "data-panel-page", "where").props.title).toBe("Works in");
    expect(rowValue(rendered, "where")).toBe("Let it choose");
    expect(rendered.html).toContain('aria-label="Let Bot use a browser"');
    click(find(rendered, "data-panel-page", "where"));
    expect(onOpen).toHaveBeenLastCalledWith("where");
    for (const page of ["browser", "folder", "android"]) expect(has(rendered, "data-panel-page", page)).toBe(false);
  });

  it("values Works in with the place chosen, and leaves where it works right now to the Works in page", () => {
    expect(rowValue(computer(makeBot({ computer: "cloud" })), "where")).toBe("Cloud desktop");
    expect(rowValue(computer(makeBot({ computer: "vm" })), "where")).toBe("Private desktop");
    const html = computer(makeBot({ tasks: [{ threadId: "thread-scout", title: "Main", surface: "local" }] as Bot["tasks"] })).html;
    expect(html).not.toContain("Right now");
  });

  it("opens the popup for a screen place from its box, which shows its last screen picture or the sleeping face", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: () => null, setItem });
    const resting = computer(makeBot({ computer: "cloud" }));
    expect(resting.html).toContain(">Bot&#x27;s screen<");
    expect(resting.html).toContain(">Sleeping<");
    expect(find(resting, "data-panel-action", "open-computer").props["aria-label"]).toBe("Open: Bot's screen");
    click(find(resting, "data-panel-action", "open-computer"));
    expect(setItem).toHaveBeenLastCalledWith("omb-computer-panel-view:scout", "computer");
    expect((fixture.dispatch as ReturnType<typeof vi.fn>).mock.calls.slice(-2)).toEqual([
      [{ type: "toggleSettings", open: false }],
      [{ type: "toggleComputer", open: true }],
    ]);
    const shot = { id: "shot", role: "bot", kind: "screen", at: 1, png: "AAAA" } as Bot["messages"][number];
    const pictured = computer(makeBot({ computer: "cloud", messages: [shot] }));
    expect(pictured.html).toContain("<img");
    expect(pictured.html).not.toContain("panel-zzz");
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  });

  it("shows the browser live while the turn uses it, and the sleeping face otherwise, with no Open row", () => {
    fixture.storeState = { ...fixture.storeState, ...browserOn };
    const tool = (name: string, at: number) => ({ id: `${name}-${at}`, role: "bot", kind: "activity", at, tool: { name } }) as Bot["messages"][number];
    const running = (messages: Bot["messages"]) => makeBot({ busy: true, messages, tasks: [{ threadId: "thread-scout", title: "Main", busy: true, turnStartedAt: 100 }] as Bot["tasks"] });
    for (const rendered of [computer(makeBot()), computer(running([tool("mcp__browser__navigate", 50), tool("Write", 120)]))]) {
      expect(rendered.html).toContain(">Bot&#x27;s browser<");
      expect(rendered.html).toContain(">Sleeping<");
      expect(rendered.html).toContain("panel-zzz");
      expect(rendered.html).not.toMatch(/>(Browsing|Done|Working|Open)</);
    }
    const browsing = computer(running([tool("mcp__browser__navigate", 120)]));
    expect(browsing.html).toContain(">Browsing<");
    expect(browsing.html).not.toContain(">Sleeping<");
    expect(find(browsing, "data-panel-action", "open-computer").props["aria-label"]).toBe("Open: Bot's browser");
  });

  it("names the bot's browser, opens it over the window, and keeps a screen place on the popup", async () => {
    const { closeBrowserWindow } = await import("./bot-panel/browser-window");
    fixture.storeState = { ...fixture.storeState, ...browserOn };
    const rendered = computer(makeBot());
    expect(find(rendered, "aria-label", "Let Bot use a browser").props.checked).toBe(true);
    try {
      click(find(rendered, "data-panel-action", "open-computer"));
      expect(fixture.dispatch).not.toHaveBeenCalled();
    } finally {
      closeBrowserWindow();
    }
    expect(computer(makeBot({ computer: "cloud" })).html).toContain(">Bot&#x27;s screen<");
  });

  it("turns the bot's browser off and on through the bot patch", () => {
    fixture.storeState = { ...fixture.storeState, ...browserOn };
    const rendered = computer(makeBot());
    expect(rendered.html).toContain('<label data-panel-row="browser-switch"');
    click(find(rendered, "aria-label", "Let Bot use a browser"));
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "updateBot", botId: "scout", patch: { browser: false } });
    click(find(computer(makeBot({ browser: false })), "aria-label", "Let Bot use a browser"));
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "updateBot", botId: "scout", patch: { browser: true } });
  });
});

describe("the Where it works page", () => {
  const where = (bot: Bot) => capture(() => WherePage({ bot, derived: derived() }));
  const choices = (rendered: Rendered) => rendered.nodes.filter((node) => node.props["data-panel-choice"] !== undefined)
    .map((node) => [node.props["data-panel-choice"], node.props.title, Boolean(node.props.disabled), node.props.checked]);
  const choose = (rendered: Rendered, value: string) => click(find(rendered, "data-panel-choice", value));

  it("offers Let it choose, this computer, the bot's browser and the Cloud desktop, with the chosen one checked", () => {
    // The tests run on no platform in particular, so this computer is a PC; a Mac says This Mac.
    expect(choices(where(makeBot()))).toEqual([
      ["auto", "Let it choose", false, true], ["local", "This PC", false, false], ["browser", "Browser", false, false], ["cloud", "Cloud desktop", false, false],
    ]);
    expect(where(makeBot()).html).toContain('role="radiogroup"');
  });

  it("saves each place through the bot patch, and sends nothing for the place already chosen", () => {
    const rendered = where(makeBot());
    choose(rendered, "cloud");
    expect(patch).toHaveBeenLastCalledWith({ computer: "cloud" });
    choose(rendered, "local");
    expect(patch).toHaveBeenLastCalledWith({ computer: "local" });
    choose(rendered, "browser");
    expect(patch).toHaveBeenLastCalledWith({ computer: "browser", browser: true });
    choose(where(makeBot({ computer: "cloud" })), "auto");
    expect(patch).toHaveBeenLastCalledWith({ computer: null });
    patch.mockReset();
    choose(where(makeBot({ computer: "cloud" })), "cloud");
    expect(patch).not.toHaveBeenCalled();
  });

  it.each([["vm", "Private desktop"], ["off", "Off"]] as const)("shows a bot kept on %s as a last, checked choice it cannot pick again", (place, label) => {
    const rendered = where(makeBot({ computer: place }));
    expect(choices(rendered).at(-1)).toEqual([place, label, true, true]);
    choose(rendered, place);
    expect(patch).not.toHaveBeenCalled();
    choose(rendered, "auto");
    expect(patch).toHaveBeenLastCalledWith({ computer: null });
  });

  it("holds a place the bot cannot use with the reason as its hint, and leaves out the Cloud desktop when none is offered", () => {
    fixture.places.cloud = [true, false, "Not ready"];
    expect(find(where(makeBot()), "data-panel-choice", "cloud").props).toMatchObject({ disabled: true, hint: "Not ready." });
    fixture.places.cloud = [false, false, "Not offered"];
    expect(choices(where(makeBot())).map(([value]) => value)).toEqual(["auto", "local", "browser"]);
    fixture.places.local = [false, false, "Not offered"];
    fixture.places.browser = [false, false, "Not offered"];
    expect(choices(where(makeBot())).map(([value]) => value)).toEqual(["auto"]);
    expect(choices(where(makeBot({ computer: "browser" }))).map(([value, , disabled]) => [value, disabled])).toEqual([["auto", false], ["browser", true]]);
  });

  it("names the browser My Chrome when the bot's profile is the person's own Chrome", () => {
    fixture.storeState = { ...fixture.storeState, config: { browserEngine: { myChrome: true }, browserProfiles: [{ id: "bank", name: "Bank", browser: "chrome" }] } };
    expect(find(where(makeBot({ browserProfile: "bank" })), "data-panel-choice", "browser").props.title).toBe("My Chrome");
    expect(find(where(makeBot()), "data-panel-choice", "browser").props.title).toBe("Browser");
  });

  it("says when a person pinned this chat to another place, and its button unpins it", () => {
    const rendered = where(makeBot({ computer: "cloud", tasks: [{ threadId: "thread-scout", title: "Main", surface: "browser" }] as Bot["tasks"] }));
    expect(rendered.html).toContain("This chat is pinned to");
    click(find(rendered, "children", "Use Cloud desktop"));
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "updateTask", botId: "scout", threadId: "thread-scout", patch: { surface: null } });
  });

  it("says where the bot works right now when that is not the place chosen", () => {
    const html = where(makeBot({ computer: "cloud", tasks: [{ threadId: "thread-scout", title: "Main", surface: "local", surfaceAuto: true }] as Bot["tasks"] })).html;
    expect(html).toContain("Right now: This PC");
    expect(html).not.toContain("This chat is pinned to");
  });

  it("warns before this computer for a bot that decides alone", () => {
    fixture.derived.approvalMode = "auto";
    const bot = makeBot();
    choose(where(bot), "local");
    expect(patch).not.toHaveBeenCalled();
    const warning = ofType(where(bot), LocalComputerAutoWarning)!;
    expect(warning.props.open).toBe(true);
    (warning.props.onConfirm as () => void)();
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "updateBot", botId: "scout", patch: { computer: "local", acknowledgeLocalAuto: true } });
  });
});

describe("the drill-in pages", () => {
  const PAGE = {
    settings: SettingsPage, apps: AppsPage, routines: AutomationsPage, memory: MemoryPage, skills: SkillsPage, folder: FolderPage, browser: BrowserPage, where: WherePage,
  } as const;
  // The walker reads only what a component returns, so each page is called as the function PageBody picks.
  const onDetail = vi.fn();
  const body = (page: keyof typeof PAGE, bot = makeBot(), detail: string | null = null) =>
    capture(() => PAGE[page]({ bot, derived: derived(), detail, onDetail }) as ReactNode);
  const confirm = (rendered: { nodes: Node[] }) => ofType(rendered, ConfirmDialog)!;

  it("draws one component per Simple page", () => {
    for (const page of Object.keys(PAGE) as Array<keyof typeof PAGE>) {
      const picked = ofType(capture(() => PageBody({ page, bot: makeBot(), derived: derived() }) as ReactNode), PAGE[page])!;
      expect(picked.props.bot, page).toMatchObject({ id: "scout" });
    }
  });
  it("gives each connected app one switch that writes the same scopes as Access, with no scopes or tool grants", () => {
    fixture.apps = { phase: "ready", connectedSlugs: ["github", "gmail", "slack"], apps: [app("github", "write"), app("gmail", "write"), app("slack", "write")] };
    const rendered = body("apps");
    expect(switches(rendered.html)).toBe(3);
    expect(rendered.html).not.toContain("Let Scout use apps");
    expect(rendered.html).not.toContain("Read only");
    expect(rendered.html).not.toContain("github things");
    click(find(rendered, "aria-label", "Scout can use Github"));
    expect(patch).toHaveBeenLastCalledWith({ connectorScopes: { apps: { gmail: "write", slack: "write" } } });

    fixture.apps = { phase: "ready", connectedSlugs: ["github", "gmail", "slack"], apps: [app("github", null), app("gmail", "read"), app("slack", "write")] };
    const scoped = body("apps", makeBot({ connectorScopes: { apps: { gmail: "read", slack: "write" } } }));
    expect(find(scoped, "aria-label", "Scout can use Github").props.checked).toBe(false);
    click(find(scoped, "aria-label", "Scout can use Github"));
    expect(patch).toHaveBeenLastCalledWith({ connectorScopes: { apps: { gmail: "read", slack: "write", github: "write" } } });
  });

  it("switching an app on while apps are off for the bot turns them on with only that app", () => {
    fixture.derived.connectedAppsEnabled = false;
    fixture.apps = { phase: "ready", connectedSlugs: ["gmail", "slack"], apps: [app("gmail", null), app("slack", null)] };
    click(find(body("apps", makeBot({ composio: false })), "aria-label", "Scout can use Gmail"));
    expect(patch).toHaveBeenLastCalledWith({ connectorScopes: { apps: { gmail: "write" } }, composio: true });
    patch.mockReset();
    click(find(body("apps", makeBot({ composio: false, connectorScopes: { apps: { slack: "write" } } })), "aria-label", "Scout can use Gmail"));
    expect(patch).toHaveBeenLastCalledWith({ connectorScopes: { apps: { slack: "write", gmail: "write" } }, composio: true });
  });

  it("says what it knows about the apps: checking, unreadable, empty or unusable, and leads to the catalog", () => {
    fixture.apps = { phase: "loading", apps: [], connectedSlugs: [] };
    expect(body("apps").html).toContain("Checking…");
    fixture.apps = { phase: "unknown", apps: [], connectedSlugs: [] };
    expect(body("apps").html).toContain("Couldn&#x27;t check your apps just now.");
    fixture.apps = { phase: "ready", apps: [], connectedSlugs: [] };
    const empty = body("apps");
    expect(empty.html).toContain("No apps connected yet.");
    click(find(empty, "data-panel-link", "add-app"));
    expect((fixture.dispatch as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      [{ type: "toggleSettings", open: false }],
      [{ type: "togglePlugins", open: true, surface: "apps" }],
    ]);
    fixture.derived.canUseConnectedApps = false;
    fixture.apps = { phase: "ready", connectedSlugs: ["gmail"], apps: [app("gmail", "write")] };
    const cannot = body("apps");
    expect(cannot.html).toContain("The model Scout runs on can&#x27;t use apps.");
    expect(switches(cannot.html)).toBe(0);
  });

  it("lists the MCP servers under the apps with a switch each, that writes the explicit list like Access", () => {
    fixture.mcp.servers = [{ name: "dodopayments-remote", enabled: true }, { name: "linear", enabled: true }];
    const rendered = body("apps");
    expect(rendered.html).toContain("MCP servers");
    expect(find(rendered, "aria-label", "Scout can use dodopayments-remote").props.checked).toBe(true);
    click(find(rendered, "aria-label", "Scout can use dodopayments-remote"));
    expect(patch).toHaveBeenLastCalledWith({ mcpServers: ["linear"] });

    const narrowed = body("apps", makeBot({ mcpServers: ["linear"] }));
    expect(find(narrowed, "aria-label", "Scout can use dodopayments-remote").props.checked).toBe(false);
    click(find(narrowed, "aria-label", "Scout can use dodopayments-remote"));
    expect(patch).toHaveBeenLastCalledWith({ mcpServers: ["linear", "dodopayments-remote"] });
  });

  it("shows a server that is off everywhere or for this bot as a disabled switch with why, and ignores it while busy", () => {
    fixture.mcp.servers = [{ name: "paused", enabled: false }, { name: "linear", enabled: true, offFor: ["scout"] }];
    const rendered = body("apps");
    expect(find(rendered, "aria-label", "Scout can use paused").props).toMatchObject({ checked: false, disabled: true });
    expect(rendered.html).toContain("Switched off in Apps");
    expect(rendered.html).toContain("Off for Scout, because it doesn&#x27;t start for them.");
    expect(find(rendered, "aria-label", "Scout can use linear").props.disabled).toBe(false);

    const busy = body("apps", makeBot({ busy: true }));
    expect(find(busy, "aria-label", "Scout can use linear").props.disabled).toBe(true);
    click(find(busy, "aria-label", "Scout can use linear"));
    expect(patch).not.toHaveBeenCalled();
  });

  it("draws no MCP card while loading or when the bot has no server, and says so when the list cannot load", () => {
    fixture.mcp = { servers: null, error: false };
    expect(body("apps").html).not.toContain("MCP servers");
    fixture.mcp = { servers: [{ name: "theirs", enabled: true, bot: "other" }], error: false };
    expect(body("apps").html).not.toContain("MCP servers");
    fixture.mcp = { servers: null, error: true };
    const failed = body("apps");
    expect(failed.html).toContain("Could not refresh MCP servers.");
    expect(switches(failed.html)).toBe(0);
  });

  it("groups this bot's routines and webhooks under their own headings, each with a switch, and opens the Automations page", async () => {
    fixture.storeState.routines = [routine(), routine({ id: "r2", name: "Other bot's brief", botId: "other" })];
    fixture.storeState.webhooks = [webhook()];
    const rendered = body("routines");
    expect(rendered.html).toContain("Routines</span> · On a schedule");
    expect(rendered.html).toContain("Webhooks</span> · When another app sends something");
    expect(rendered.html.indexOf("Morning brief")).toBeLessThan(rendered.html.indexOf("Release alert"));
    expect(rendered.html).not.toContain("Other bot&#x27;s brief");
    expect(rendered.html).not.toContain("App events");
    expect(switches(rendered.html)).toBe(2);
    expect(rendered.html).toContain("Or just ask Scout in chat: “every weekday at 8, send me a summary”.");

    expect(rendered.html).toContain('<span class="block truncate">Release alert</span>');
    expect(find(rendered, "data-panel-open", "w1").props.title).toMatch(/^Release alert\n\S/);
    click(find(rendered, "data-panel-open", "w1"));
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "showRoutines", view: "list", routineId: "w1" });
    click(find(rendered, "data-panel-link", "new-automation"));
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "showRoutines", view: "list", compose: true });
    click(find(rendered, "data-panel-link", "all-automations"));
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "showRoutines", view: "list" });

    (find(rendered, "aria-label", "Turn “Morning brief” on or off").props.onClick as () => void)();
    await vi.waitFor(() => expect(fixture.api).toHaveBeenCalledWith("/api/routines/r1", { method: "PATCH", body: JSON.stringify({ enabled: false }) }));
  });

  it("says nothing runs on its own yet when the bot has no automations, and offers only New automation", () => {
    const rendered = body("routines");
    expect(rendered.html).toContain("Nothing runs on its own yet.");
    expect(switches(rendered.html)).toBe(0);
    expect(has(rendered, "data-panel-link", "new-automation")).toBe(true);
    expect(has(rendered, "data-panel-link", "all-automations")).toBe(false);
  });

  it("says Checking while routines or app events load, and shows the load error instead of an empty list", () => {
    fixture.appTriggersLoaded = false;
    expect(body("routines").html).toContain("Checking…");
    fixture.appTriggersLoaded = true;
    fixture.storeState.routinesLoadState = "loading";
    expect(body("routines").html).toContain("Checking…");
    fixture.storeState.routinesLoadState = "error";
    const failed = body("routines");
    expect(failed.html).toContain("Couldn&#x27;t refresh routines.");
    expect(failed.html).not.toContain("Nothing runs on its own yet.");
  });

  it("holds every switch while one automation is being turned on or off", () => {
    fixture.storeState.routines = [routine(), routine({ id: "r2", name: "Evening brief" })];
    let release = () => {};
    fixture.api = vi.fn(() => new Promise((resolve) => { release = () => resolve({ routine: routine({ enabled: false }) }); }));
    (find(body("routines"), "aria-label", "Turn “Morning brief” on or off").props.onClick as () => void)();
    const busy = body("routines");
    expect(find(busy, "aria-label", "Turn “Morning brief” on or off").props.disabled).toBe(true);
    expect(find(busy, "aria-label", "Turn “Evening brief” on or off").props.disabled).toBe(true);
    release();
  });

  it("lists each note as one line without its date or source, opens one, deletes it after a confirm, and adds one", async () => {
    onDetail.mockReset();
    fixture.memory.docs = [memoryDoc('# Notes\n- 2026-11-04 · from chat "Rename the bot" · Likes short replies · updated 2026-11-05\n\n- Uses Resolve Studio\n')];
    const rendered = body("memory");
    expect(rendered.html).toContain(">Likes short replies<");
    expect(rendered.html).toContain(">Uses Resolve Studio<");
    for (const text of ["# Notes", "2026-11-04", "Rename the bot", "updated", "Tidy now", "Upkeep", "Obsidian", "Daily logs", "Journal"]) expect(rendered.html).not.toContain(text);
    expect(switches(rendered.html)).toBe(0);
    expect(has(rendered, "label", "Forget")).toBe(false);
    click(find(rendered, "data-memory-note", 1));
    const key = memoryNoteKey(panelMemoryNotes(fixture.memory.docs)[0]!);
    expect(key.startsWith("MEMORY.md:1:")).toBe(true);
    expect(onDetail).toHaveBeenLastCalledWith(key);

    const note = body("memory", makeBot(), key);
    expect(note.html).toContain(">Likes short replies<");
    expect(note.html).toContain(">From chat &quot;Rename the bot&quot; · Nov 4, 2026<");
    expect(confirm(note).props.open).toBe(false);
    click(find(note, "data-panel-action", "delete-memory"));
    expect(fixture.saveMemory).not.toHaveBeenCalled();
    const asking = confirm(body("memory", makeBot(), key));
    expect(asking.props).toMatchObject({ open: true, tone: "danger", title: "Delete this note?", body: "Scout will no longer remember it.", confirmLabel: "Delete" });
    (asking.props.onConfirm as () => void)();
    await Promise.resolve();
    expect(fixture.saveMemory).toHaveBeenLastCalledWith("scout", "MEMORY.md", "# Notes\n\n- Uses Resolve Studio\n", "h1", false);
    await Promise.resolve();
    expect(fixture.memory.setDoc).toHaveBeenLastCalledWith(expect.objectContaining({ text: "# Notes\n\n- Uses Resolve Studio\n", hash: "h2" }));
    await vi.waitFor(() => expect(onDetail).toHaveBeenLastCalledWith(null));

    (find(body("memory"), "data-panel-form", "memory-add").props.onChange as (value: string) => void)("  Prefers the free version ");
    (find(body("memory"), "data-panel-form", "memory-add").props.onSubmit as () => void)();
    await Promise.resolve();
    expect(fixture.saveMemory).toHaveBeenLastCalledWith("scout", "MEMORY.md", '# Notes\n- 2026-11-04 · from chat "Rename the bot" · Likes short replies · updated 2026-11-05\n\n- Uses Resolve Studio\n- Prefers the free version\n', "h1", false);
  });

  it("says when memory is off, empty or unreadable, and re-reads on a conflict", async () => {
    expect(body("memory", makeBot({ memoryEnabled: false })).html).toContain("Memory is off for Scout.");
    expect(has(body("memory", makeBot({ memoryEnabled: false })), "data-panel-form", "memory-add")).toBe(false);
    fixture.memory.docs = [memoryDoc("")];
    expect(body("memory").html).toContain("Nothing remembered yet.");
    fixture.memory = { ...fixture.memory, docs: null, error: true };
    expect(body("memory").html).toContain("Couldn&#x27;t read the memory file just now.");

    fixture.memory = { ...fixture.memory, docs: [memoryDoc("- Old\n")], error: false };
    fixture.saveMemory = vi.fn(() => Promise.resolve({ ok: false, conflict: true, current: "- New\n", currentHash: "h3" }));
    const old = memoryNoteKey(panelMemoryNotes([memoryDoc("- Old\n")])[0]!);
    click(find(body("memory", makeBot(), old), "data-panel-action", "delete-memory"));
    (confirm(body("memory", makeBot(), old)).props.onConfirm as () => void)();
    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.memory.reload).toHaveBeenCalled();
    expect(body("memory", makeBot(), old).html).toContain("Scout changed this file while you were editing.");
  });

  it("switches skills from the list, opens one, removes it after a confirm, adds one from a link and browses the library or skills.sh", async () => {
    onDetail.mockReset();
    const off = skill("summarise", false);
    const shared = skill("triage", true, "library");
    fixture.skills.skills = [shared, off];
    const rendered = body("skills");
    const toggle = find(rendered, "aria-label", "Use summarise");
    expect(toggle.props).toMatchObject({ checked: false, disabled: false });
    expect(rendered.html).toContain(">summarise helper<");
    click(toggle);
    expect(fixture.skills.toggle).toHaveBeenCalledWith(off);
    expect(rendered.html).not.toContain("Write a command");
    expect(has(rendered, "data-panel-action", "remove-skill:summarise")).toBe(false);
    const open = find(rendered, "data-panel-open", "skill:summarise");
    expect(open.props.className).toContain("after:inset-0");
    click(open);
    expect(onDetail).toHaveBeenLastCalledWith("summarise");

    const page = body("skills", makeBot(), "summarise");
    expect(page.html).toContain(">summarise<");
    expect(page.html).toContain(">summarise helper<");
    expect(find(page, "aria-label", "Use summarise").props.checked).toBe(false);
    click(find(page, "data-panel-action", "remove-skill:summarise"));
    expect(fixture.api).not.toHaveBeenCalled();
    const asking = confirm(body("skills", makeBot(), "summarise"));
    expect(asking.props).toMatchObject({ open: true, tone: "danger", title: "Remove the skill “summarise”?", body: "Scout stops using it.", confirmLabel: "Remove" });
    (asking.props.onConfirm as () => void)();
    await Promise.resolve();
    expect(fixture.api).toHaveBeenCalledWith("/api/bots/scout/skills/summarise", { method: "DELETE" });
    await Promise.resolve();
    expect(fixture.skills.refresh).toHaveBeenCalled();
    await Promise.resolve();
    expect(onDetail).toHaveBeenLastCalledWith(null);
    click(find(body("skills", makeBot(), "triage"), "data-panel-action", "remove-skill:triage"));
    (confirm(body("skills", makeBot(), "triage")).props.onConfirm as () => void)();
    expect(fixture.skills.putAssignments).toHaveBeenCalledWith("triage", true);

    (find(rendered, "data-panel-form", "skill-import").props.onChange as (value: string) => void)("owner/repo");
    (find(body("skills"), "data-panel-form", "skill-import").props.onSubmit as () => void)();
    await Promise.resolve();
    expect(fixture.api).toHaveBeenCalledWith("/api/bots/scout/skills", { method: "POST", body: JSON.stringify({ source: "owner/repo" }) });

    click(find(rendered, "data-panel-link", "browse-skills"));
    expect(fixture.openExternal).toHaveBeenCalledWith("https://skills.sh");
    fixture.storeState = { ...fixture.storeState, config: { features: { skillsLibrary: true } } };
    click(find(body("skills"), "data-panel-link", "browse-skills"));
    expect((fixture.dispatch as ReturnType<typeof vi.fn>).mock.calls.slice(-2)).toEqual([
      [{ type: "toggleSettings", open: false }],
      [{ type: "toggleAppSettings", open: true, section: "skills" }],
    ]);
    fixture.skills.working = "triage";
    expect(find(body("skills"), "aria-label", "Use summarise").props.disabled).toBe(true);
    fixture.skills.skills = [];
    expect(body("skills").html).toContain("Scout hasn&#x27;t learned any skills yet.");
  });

  it("keeps the bot's own private folder, or a folder chosen with the native picker, saved through the bot route", async () => {
    const pickFolder = vi.fn(() => Promise.resolve("/Users/omkar/Projects/site"));
    (window as unknown as { ogb: unknown }).ogb = { pickFolder };
    const rendered = body("folder");
    expect(find(rendered, "data-panel-choice", "private").props.checked).toBe(true);
    expect(find(rendered, "data-panel-choice", "pick").props.checked).toBe(false);
    expect(has(rendered, "data-panel-action", "pick-folder")).toBe(false);
    expect(rendered.html).not.toContain("Changed in this chat");
    click(find(rendered, "data-panel-choice", "pick"));
    await Promise.resolve();
    expect(pickFolder).toHaveBeenCalledWith(undefined);
    await Promise.resolve();
    expect(fixture.api).toHaveBeenCalledWith("/api/bots/scout", { method: "PATCH", body: JSON.stringify({ cwd: "/Users/omkar/Projects/site" }) });

    fresh();
    const chosen = body("folder", makeBot({ cwd: "/Users/omkar/Projects/site" }));
    expect(find(chosen, "data-panel-choice", "pick").props.checked).toBe(true);
    expect(chosen.html).toContain("/Users/omkar/Projects/site");
    click(find(chosen, "data-panel-action", "pick-folder"));
    expect(pickFolder).toHaveBeenLastCalledWith("/Users/omkar/Projects/site");
    click(find(chosen, "data-panel-choice", "private"));
    expect(fixture.api).toHaveBeenLastCalledWith("/api/bots/scout", { method: "PATCH", body: JSON.stringify({ cwd: null }) });
  });

  it("takes a typed path where there is no native picker", () => {
    const rendered = body("folder");
    click(find(rendered, "data-panel-choice", "pick"));
    const typed = body("folder");
    expect(find(typed, "data-panel-choice", "pick").props.checked).toBe(true);
    const form = find(typed, "data-panel-form", "folder-path");
    change(nodes(form.props.children).find((node) => node.type === "input")!, "/tmp/work");
    submit(find(body("folder"), "data-panel-form", "folder-path"));
    expect(fixture.api).toHaveBeenLastCalledWith("/api/bots/scout", { method: "PATCH", body: JSON.stringify({ cwd: "/tmp/work" }) });
  });

  it("shows only the signed-in sites on the browser page, with no browser or record-steps switch", () => {
    fixture.ownerOrAdmin = true;
    const page = body("browser");
    expect(ofType(page, BrowserLogins)!.props).toMatchObject({ bot: expect.objectContaining({ id: "scout" }), browserEnabled: true });
    const rendered = capture(() => BrowserLogins({ bot: makeBot(), browserEnabled: true, onOpenBrowser: vi.fn() }));
    expect(ofType(rendered, SignedInSites)!.props).toMatchObject({ bare: true, target: { bot: "scout" }, sharedBy: ["Scout"], disabled: false });
    expect(switches(rendered.html)).toBe(0);
    expect(rendered.html).not.toContain("Record");
    expect(rendered.html).not.toContain(">Logins<");
    const onOpenBrowser = vi.fn();
    click(find(capture(() => BrowserLogins({ bot: makeBot(), browserEnabled: true, onOpenBrowser })), "data-panel-action", "add-login"));
    expect(onOpenBrowser).toHaveBeenCalled();
    fixture.derived.browserEnabled = false;
    expect(ofType(body("browser"), BrowserLogins)!.props.browserEnabled).toBe(false);
    expect(capture(() => BrowserLogins({ bot: makeBot(), browserEnabled: false, onOpenBrowser: vi.fn() })).html).toContain("Scout&#x27;s browser is off.");
  });
});

describe("the bot settings dialog", () => {
  it("opens on the Simple panel without the accordion, and hands it the deep-linked section", () => {
    const bot = makeBot();
    const simple = dialog(bot);
    expect(simple.html).toContain('id="bot-panel"');
    const shell = ofType(simple, BotPanel)!;
    expect(shell.props.bot).toBe(bot);
    expect(shell.props.linkedSection).toBeNull();
    expect(simple.html).not.toContain("data-bot-settings-section");

    fresh();
    fixture.storeState = { settingsOpen: true, botSettingsSection: "model", botSettingsExpandAccordion: true };
    expect(ofType(dialog(bot), BotPanel)!.props.linkedSection).toBe("model");
  });

  it("a stored section never moves the Simple panel", () => {
    fixture.storeState = {
      settingsOpen: true, botSettingsSection: "model", botSettingsExpandAccordion: true,
      botSettingsSectionStored: true, botSettingsExpandRemembered: true,
    };
    expect(ofType(dialog(makeBot()), BotPanel)!.props.linkedSection).toBeNull();
  });

  it("leaves Advanced mode on the full accordion", () => {
    fixture.advanced = true;
    const rendered = dialog(makeBot());
    expect(ofType(rendered, BotPanel)).toBeUndefined();
    expect(rendered.html).not.toContain('id="bot-panel"');
    expect(rendered.html).toContain("Search settings");
    for (const label of ["Overview", "Identity", "Soul", "Skills", "Memory", "Routines", "Access", "Model", "Permissions", "Voice &amp; alerts", "History", "Usage"]) {
      expect(rendered.html).toContain(`>${label}</span>`);
    }
    // The accordion keeps the Memory and Access sections, where the memory, upkeep, browser and record-steps switches live.
    for (const section of ["memory", "access", "model", "permissions"]) expect(rendered.html).toContain(`data-bot-settings-section="${section}"`);
  });

  it("a stored section opens expanded in the full view", () => {
    fixture.advanced = true;
    fixture.storeState = {
      settingsOpen: true, botSettingsSection: "model", botSettingsExpandAccordion: true,
      botSettingsSectionStored: true, botSettingsExpandRemembered: true,
    };
    const rowOpen = (rendered: Rendered, id: string) =>
      (Children.toArray(find(rendered, "data-bot-settings-section", id).props.children)[0] as Node).props["aria-expanded"] === true;
    expect(rowOpen(dialog(makeBot()), "model")).toBe(true);
    const search = find(dialog(makeBot()), "aria-label", "Search settings");
    change(search, "model");
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "toggleSettings", open: true });
    fixture.storeState = { ...fixture.storeState, botSettingsExpandAccordion: false, botSettingsExpandRemembered: false };
    expect(rowOpen(dialog(makeBot()), "model")).toBe(false);
  });

  it("one click on a remembered-expanded row collapses it", () => {
    fixture.advanced = true;
    fixture.storeState = {
      settingsOpen: true, botSettingsSection: "model", botSettingsExpandAccordion: true,
      botSettingsSectionStored: true, botSettingsExpandRemembered: true,
    };
    const row = find(dialog(makeBot()), "data-bot-settings-section", "model");
    click(Children.toArray(row.props.children)[0] as Node);
    expect(fixture.dispatch).toHaveBeenLastCalledWith({ type: "toggleSettings", open: true });
  });

  it("shows Switch them too in the full Model section, and its button switches them", () => {
    fixture.advanced = true;
    fixture.storeState = { settingsOpen: true, botSettingsSection: "model", botSettingsExpandAccordion: true };
    const opus = { instanceId: "claude", model: "claude-opus-5-5" };
    const tasks = [
      { threadId: "thread-scout", title: "Follows", createdAt: 1, modelSelection: opus, followsBotModel: true },
      ...[0, 1, 2].map((index) => ({ threadId: `own-${index}`, title: `Own ${index}`, createdAt: 1, modelSelection: { instanceId: "codex", model: "gpt-5.6" }, followsBotModel: false })),
    ];
    const rendered = dialog(makeBot({ tasks }));
    expect(rendered.html).toContain("3 threads use their own model.");
    expect(rendered.html).toContain("Switch them too");
    fresh();
    const section = capture(() => ModelSection({ bot: makeBot({ tasks }) }));
    const line = ofType(section, ThreadModelsLine)!;
    click(capture(() => ThreadModelsLine(line.props as never)).nodes.find((node) => node.props["data-switch-them-too"] !== undefined)!);
    expect(fixture.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: "followBotModel", botId: "scout" }));
  });
});

describe("the panel's switches", () => {
  it("are the shared switch, in the bot's own color when on", () => {
    fixture.apps = { phase: "ready", connectedSlugs: ["gmail"], apps: [app("gmail", "write")] };
    const html = capture(() => PageBody({ page: "apps", bot: makeBot({ color: "blue" }), derived: derived() }) as ReactNode).html;
    expect(html.match(/role="switch"/g)).toHaveLength(1);
    expect(html).toContain("background-color:#377FE6");
    expect(Switch).toBeDefined();
  });
});
