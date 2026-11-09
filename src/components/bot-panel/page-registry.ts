import type { LocaleKey } from "@/locales";
import type { BotSettingsSection } from "@/state/store";

export type PageId =
  | "settings" | "where"
  | "setup" | "model" | "instructions" | "approvals" | "always" | "routines" | "apps" | "backups" | "botapi"
  | "memory" | "skills"
  | "browser" | "folder" | "android" | "data" | "files" | "activity"
  | "voice" | "blurb" | "team" | "chiefteams" | "mcp" | "tools" | "webhooks" | "visibility" | "slack"
  | "overview" | "prompt" | "history";

/** The pages Simple mode draws; a link to any other page lands where its section does. */
export const SIMPLE_PAGES = ["settings", "apps", "backups", "botapi", "routines", "visibility", "memory", "skills", "folder", "browser", "where", "data", "files", "activity"] as const satisfies readonly PageId[];
export type SimplePageId = (typeof SIMPLE_PAGES)[number];

export function isSimplePage(page: PageId): page is SimplePageId {
  return (SIMPLE_PAGES as readonly PageId[]).includes(page);
}

export interface PageMeta {
  title: LocaleKey;
  intro?: LocaleKey;
}

export const PAGES: Record<PageId, PageMeta> = {
  settings: { title: "botPanel.page.settings" },
  where: { title: "computer.simple.whereWorks" },
  setup: { title: "botSetup.ideas" },
  model: { title: "model.simple.model" },
  instructions: { title: "botSettings.simple.instructions" },
  approvals: { title: "botPanel.page.approvals" },
  routines: { title: "automations.title" },
  apps: { title: "botPanel.appsRow", intro: "botPanel.apps.intro" },
  backups: { title: "botPanel.backups.title", intro: "botPanel.backups.hint" },
  botapi: { title: "botApi.title" },
  memory: { title: "botPanel.memoryRow", intro: "botPanel.memory.intro" },
  skills: { title: "botSettings.simple.skills", intro: "botSettings.simple.skillsHint" },
  browser: { title: "settings.sites.title" },
  folder: { title: "computer.files.folder", intro: "botPanel.folder.intro" },
  android: { title: "botPanel.page.android" },
  data: { title: "computer.tab.data" },
  files: { title: "computer.tab.files" },
  activity: { title: "activity.panel.title", intro: "activity.panel.subtitle" },
  voice: { title: "botPanel.page.voice" },
  blurb: { title: "botPanel.page.blurb" },
  team: { title: "botPanel.page.team" },
  chiefteams: { title: "botPanel.page.chiefTeams" },
  mcp: { title: "connectors.tab.mcp" },
  tools: { title: "botAccess.tools.title" },
  webhooks: { title: "botPanel.page.webhooks" },
  always: { title: "botPanel.page.always" },
  visibility: { title: "botSettings.visibility.title" },
  slack: { title: "botPanel.page.slack" },
  overview: { title: "botPanel.page.overview" },
  prompt: { title: "botPanel.page.prompt" },
  history: { title: "botPanel.page.history" },
};

export const PAGE_IDS = Object.keys(PAGES) as PageId[];

export interface PanelTarget {
  page?: SimplePageId;
  anchor?: string;
  /** Opens the Instructions editor in place on the Bot settings page. */
  editInstructions?: boolean;
}

const SECTION_TARGET: Record<BotSettingsSection, PanelTarget> = {
  overview: {},
  identity: {},
  slack: {},
  soul: { page: "settings", anchor: "instructions", editInstructions: true },
  skills: { page: "skills" },
  memory: { page: "memory" },
  library: { anchor: "keeps" },
  routines: { page: "routines" },
  access: { anchor: "computer" },
  model: { anchor: "model" },
  permissions: { page: "settings", anchor: "approval" },
  voice: {},
  visibility: {},
  history: {},
  usage: {},
};

export function sectionTarget(section: BotSettingsSection): PanelTarget {
  return SECTION_TARGET[section];
}
