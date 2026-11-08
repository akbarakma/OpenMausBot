import { AppWindow, Brain, FileText, Folder, Globe, Table2, Zap } from "lucide-react";
import { useMemo } from "react";

import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { usePageOpener } from "@/lib/page-open";
import { shortPath } from "@/lib/short-path";
import { SIDEBAR_INLINE, useMediaQuery } from "@/lib/use-media-query";
import { useStore, visibleMessages, type Bot, type Message } from "@/state/store";
import { AttachedFileChip } from "../AttachmentPreview";
import { recentChangedFiles, sharedFileReferences } from "../ComputerFilesPane";
import { useDesktopCapabilities } from "../DesktopCapabilities";
import { skillSwitchOn, useManagedSkills } from "../bot-settings/SkillsSection";
import type { SimplePageId } from "./page-registry";
import { Card, CardLabel, CardSurface, NavRow } from "./rows";
import { panelMemoryNotes } from "./memory-notes";
import { useMemoryDoc } from "./use-memory-doc";

export interface LibraryItems {
  pages: Array<{ messageId: string; title: string; url: string }>;
  apps: Array<{ messageId: string; title: string }>;
  shared: Array<NonNullable<ReturnType<ReturnType<typeof sharedFileReferences>["get"]>>>;
  unshared: string[];
}

/** What the bot made in the open conversation, newest first: its live published pages, its apps, and its files. */
export function libraryItems(bot: Bot, messages: readonly Message[] = visibleMessages(bot)): LibraryItems {
  const pages: LibraryItems["pages"] = [];
  const apps: LibraryItems["apps"] = [];
  const seenPages = new Set<string>();
  for (const message of [...messages].reverse()) {
    const page = message.publishedPage;
    if (page?.state === "live" && page.url && !seenPages.has(page.url)) {
      seenPages.add(page.url);
      pages.push({ messageId: message.id, title: page.title || page.url, url: page.url });
    }
    if (message.kind === "app" && message.app?.doc) apps.push({ messageId: message.id, title: message.app.title });
  }
  const references = sharedFileReferences(bot);
  const shared: LibraryItems["shared"] = [];
  const seenFiles = new Set<string>();
  for (const reference of references.values()) {
    if (seenFiles.has(reference.file.path)) continue;
    seenFiles.add(reference.file.path);
    shared.push(reference);
  }
  const unshared = recentChangedFiles(bot).filter((path) => !references.has(path));
  return { pages, apps, shared, unshared };
}

const fileName = (path: string) => path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);

/** The chat's own folder when it keeps one, else the bot's; null is the home folder. */
export function chatFolder(bot: Bot): string | null | undefined {
  const pinned = bot.tasks?.find((task) => task.threadId === bot.threadId)?.cwd;
  return pinned === undefined ? bot.cwd : pinned;
}

export function KnowsCard({ bot, onOpen, onData, folder = bot.cwd, dataLabel = "data.sources.label" }: {
  bot: Bot;
  onOpen: (page: SimplePageId) => void;
  onData: () => void;
  folder?: string | null;
  dataLabel?: LocaleKey;
}) {
  const { capabilities } = useDesktopCapabilities();
  const skills = useManagedSkills(bot);
  const memory = useMemoryDoc(bot);
  const skillsOn = skills.skills.filter((skill) => skillSwitchOn(skill) && skill.origin !== "native").length;
  const notes = memory.docs ? panelMemoryNotes(memory.docs).length : null;
  const memoryValue = bot.memoryEnabled === false ? t("botPanel.memory.off")
    : notes === null ? (memory.error ? t("botPanel.memory.nothingYet") : undefined)
    : notes === 0 ? t("botPanel.memory.nothingYet")
    : notes === 1 ? t("botPanel.memory.note") : t("botPanel.memory.notes", { count: notes });
  return (
    <Card label={t("botPanel.knows", { name: bot.name })} anchor="keeps">
      <NavRow data-panel-page="memory" icon={Brain} title={t("botPanel.memoryRow")} value={memoryValue} onClick={() => onOpen("memory")} />
      <NavRow
        data-panel-page="skills"
        icon={Zap}
        title={t("botSettings.simple.skills")}
        value={skills.loading ? undefined : skillsOn > 0 ? skillsOn : t("botPanel.none")}
        onClick={() => onOpen("skills")}
      />
      <NavRow
        data-panel-page="folder"
        icon={Folder}
        title={t("computer.files.folder")}
        value={folder ? shortPath(folder, capabilities.host?.homeDir) : folder === null ? t("computer.files.homeFolder") : t("botPanel.folder.private")}
        onClick={() => onOpen("folder")}
      />
      <NavRow data-panel-action="open-data" icon={Table2} title={t(dataLabel)} onClick={onData} />
    </Card>
  );
}

export function MadeHere({ bot, folders = false }: { bot: Bot; folders?: boolean }) {
  const { dispatch } = useStore();
  const { capabilities } = useDesktopCapabilities();
  const openPage = usePageOpener();
  const phone = !useMediaQuery(SIDEBAR_INLINE, true);
  const { pages, apps, shared, unshared } = useMemo(() => libraryItems(bot), [bot]);
  const showInChat = (messageId: string) => {
    dispatch({ type: "focusMessage", threadId: bot.threadId, messageId });
    if (phone) dispatch({ type: "toggleSettings", open: false });
  };
  const made = pages.length + apps.length + shared.length + unshared.length > 0;
  const folderLine = (path: string) => {
    const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return folders && cut > 0 ? <div className="mt-1 truncate px-2.5 text-[11px] text-ink-tertiary">{shortPath(path.slice(0, cut), capabilities.host?.homeDir)}</div> : null;
  };

  if (!made) return <p data-panel-empty="library" className="mx-1 text-[13px] leading-[18px] text-ink-tertiary">{t("botPanel.library.empty")}</p>;
  return (
    <div className="flex flex-col gap-3">
      {pages.length + apps.length > 0 && (
        <CardSurface>
          {pages.map((page) => (
            <NavRow key={page.url} data-panel-row="page" icon={Globe} title={<span className="block truncate">{page.title}</span>} hint={<span className="block truncate">{page.url}</span>} onClick={() => openPage(page.url)} />
          ))}
          {apps.map((app) => (
            <NavRow key={app.messageId} data-panel-row="app" icon={AppWindow} title={<span className="block truncate">{app.title}</span>} onClick={() => showInChat(app.messageId)} />
          ))}
        </CardSurface>
      )}
      {shared.length + unshared.length > 0 && (
        <ul data-panel-card="files" aria-label={t("botPanel.library.files")} className="flex flex-col gap-1.5">
          {shared.map((reference) => (
            <li key={`${reference.message.messageId}:${reference.file.path}`} className="min-w-0">
              <AttachedFileChip file={reference.file} message={reference.message} linked={reference.file.linked} className="w-full max-w-none" />
              {folderLine(reference.file.path)}
            </li>
          ))}
          {unshared.map((path) => (
            <li key={path} title={t("computer.files.notSharedHint")} className="min-w-0">
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-hairline/40 px-2.5 py-2">
                <FileText size={14} className="shrink-0 text-ink-secondary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{fileName(path)}</span>
                <span className="shrink-0 text-[11px] text-ink-tertiary">{t("computer.files.notShared")}</span>
              </div>
              {folderLine(path)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LibraryTab({ bot, onOpen }: { bot: Bot; onOpen: (page: SimplePageId) => void }) {
  const { dispatch } = useStore();
  const openData = () => {
    dispatch({ type: "toggleSettings", open: false });
    dispatch({ type: "openDataResult", botId: bot.id });
  };
  return (
    <div data-panel-tabpanel="library">
      <KnowsCard bot={bot} onOpen={onOpen} onData={openData} />
      <CardLabel>{t("botPanel.library.scope")}</CardLabel>
      <MadeHere bot={bot} />
    </div>
  );
}
