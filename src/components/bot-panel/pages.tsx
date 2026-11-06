import { useEffect, useState, type ReactNode } from "react";
import { FolderOpen, Plus, Server } from "lucide-react";

import { appSwitchPatch } from "@/lib/bot-app-access";
import { cn } from "@/lib/cn";
import { skillsLibraryEnabled } from "@/lib/feature-flags";
import { activeLocale, t } from "@/lib/i18n";
import { mcpServersForBot, mcpServersOfBot, mcpSwitch, useMcpServers } from "@/lib/mcp-servers";
import { deleteMemoryDoc, MEMORY_INDEX, saveMemoryDoc, type MemoryDoc } from "@/lib/memory";
import { openExternalLink } from "@/lib/app-links";
import type { Routine } from "@/lib/routines";
import type { SkillImportSummary } from "../../../shared/skill-import";
import { shortPath } from "@/lib/short-path";
import { skillImportLines } from "@/lib/skill-import";
import { useStore, type Bot } from "@/state/store";
import { ConfirmDialog } from "../ConfirmDialog";
import { useDesktopCapabilities } from "../DesktopCapabilities";
import { ServiceIcon } from "../ServiceIcon";
import { RoutineEditor } from "../RoutinesPage";
import { useWorkingFolder } from "../bot-settings/AccessSection";
import { BotApiCard } from "../bot-settings/BotApiCard";
import { useBotEditor } from "../bot-settings/BotEditorContext";
import { SkillReviewDialog, useManagedSkills, type ManagedSkill } from "../bot-settings/SkillsSection";
import { useBotApps, type BotApp } from "../bot-settings/useBotApps";
import type { useBotSettingsDerived } from "../bot-settings/useBotSettingsDerived";
import { RoutineList } from "../routines/RoutineList";
import { BackupAis } from "./BackupAis";
import { BrowserLogins } from "./browser-logins";
import { useOpenComputer, WherePage } from "./ComputerTab";
import { SettingsPage } from "./SettingsPage";
import { memoryNoteKey, memoryNoteParts, panelMemoryNotes, withMemoryNote, withoutMemoryNote, type PanelMemoryNote } from "./memory-notes";
import type { SimplePageId } from "./page-registry";
import { BotSwitch, buttonCls, Card, LinkRow, NavRow, NoteRow, RadioRow, RowIcon, rowCls, RowText, TextRow } from "./rows";
import { useMemoryDoc } from "./use-memory-doc";

type Derived = ReturnType<typeof useBotSettingsDerived>;

export interface PageContext {
  bot: Bot;
  derived: Derived;
}

/** The one item a list page has open in place of its list (a memory note's key, a skill's name), or null. */
interface DetailContext {
  detail: string | null;
  onDetail: (key: string | null) => void;
}

const dateFormat = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date ? null : new Intl.DateTimeFormat(activeLocale(), { dateStyle: "medium", timeZone: "UTC" }).format(day);
};

export const pageSurfaceCls = "flex flex-col gap-3";

const SKILLS_SITE = "https://skills.sh";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function AppsPage({ bot, derived }: PageContext) {
  const { dispatch } = useStore();
  const apps = useBotApps(bot);
  const { servers: allServers, error: mcpError } = useMcpServers();
  const { patch, canUseConnectedApps } = derived;
  const servers = allServers ? mcpServersOfBot(allServers, bot.id) : [];
  const mounted = new Set(mcpServersForBot(servers, bot.mcpServers, bot.id).map((server) => server.name));

  const toggle = (app: BotApp) => {
    const next = appSwitchPatch(bot, apps.connectedSlugs, app.slug, app.scope === null);
    if (Object.keys(next).length > 0) patch(next);
  };
  const toggleServer = (name: string) => {
    if (bot.busy || mcpError) return;
    patch({ mcpServers: mcpSwitch(servers, bot.mcpServers, name) });
  };
  const note = !canUseConnectedApps
    ? t("botSettings.simple.appsCannot", { name: bot.name })
    : apps.phase === "loading"
      ? t("common.checking")
      : apps.phase === "unknown"
        ? t("botSettings.simple.appsUnknown")
        : apps.apps.length === 0
          ? t("botSettings.simple.appsNone")
          : null;

  return (
    <>
      <Card>
        {note && <NoteRow>{note}</NoteRow>}
        {canUseConnectedApps && apps.apps.map((app) => (
          <div key={app.slug} data-simple-app={app.slug} className={rowCls}>
            <ServiceIcon key={`${app.card.logo}:${app.card.domain}`} card={app.card} className="size-7 shrink-0" />
            <div className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{app.label}</div>
            <BotSwitch
              color={bot.color}
              checked={app.scope !== null}
              aria-label={t("botSettings.simple.appToggle", { name: bot.name, app: app.label })}
              disabled={Boolean(bot.busy)}
              onClick={() => toggle(app)}
              className="disabled:cursor-not-allowed"
            />
          </div>
        ))}
      </Card>
      {(servers.length > 0 || mcpError) && (
        <Card label={t("connectors.tab.mcp")}>
          {mcpError && <NoteRow>{t("botAccess.mcpRefreshError")}</NoteRow>}
          {servers.map((server) => (
            <div key={server.name} data-simple-mcp={server.name} className={rowCls}>
              <RowIcon icon={Server} />
              <RowText
                title={<span className="block truncate">{server.name}</span>}
                hint={!server.enabled ? t("botAccess.mcpDisabled") : server.offFor?.includes(bot.id) ? t("mcp.offFor", { bots: bot.name }) : undefined}
              />
              <BotSwitch
                color={bot.color}
                checked={mounted.has(server.name)}
                aria-label={t("botSettings.simple.appToggle", { name: bot.name, app: server.name })}
                disabled={!server.enabled || Boolean(bot.busy) || mcpError}
                onClick={() => toggleServer(server.name)}
                className="disabled:cursor-not-allowed"
              />
            </div>
          ))}
        </Card>
      )}
      <Card>
        <LinkRow
          data-panel-link="add-app"
          icon={Plus}
          onClick={() => {
            dispatch({ type: "toggleSettings", open: false });
            dispatch({ type: "togglePlugins", open: true, surface: "apps" });
          }}
        >
          {t("botPanel.apps.connectAnother")}
        </LinkRow>
      </Card>
    </>
  );
}

export function RoutinesPage({ bot, derived }: PageContext) {
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState<Routine | "new" | null>(null);
  return (
    <>
      <RoutineList
        routines={derived.botRoutines}
        runs={state.routineRuns}
        loading={state.routinesLoadState === "loading" && derived.botRoutines.length === 0}
        error={state.routinesLoadState === "error"}
        onOpen={setEditing}
        onLogs={(routine) => dispatch({ type: "showRoutines", section: "logs", botId: bot.id, routineId: routine.id })}
        onToggle={(routine) => dispatch({ type: "updateRoutine", routineId: routine.id, patch: { enabled: !routine.enabled } })}
      />
      <Card>
        <LinkRow data-panel-action="new-routine" icon={Plus} onClick={() => setEditing("new")}>{t("botPanel.routines.add")}</LinkRow>
      </Card>
      <p className="mx-1 text-[13px] leading-normal text-ink-secondary">{t("botPanel.routines.ask", { name: bot.name })}</p>
      {editing && (
        <RoutineEditor
          key={bot.id}
          routine={editing === "new" ? undefined : editing}
          bots={[bot]}
          lockedBotId={bot.id}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/** MEMORY.md's bullets, and on a Team Cloud the person's own notes. Every write goes through the memory file route with
 * the hash it was read at, so a note the bot added meanwhile is never lost: a conflict re-reads and asks again. */
export function MemoryPage({ bot, detail, onDetail }: PageContext & DetailContext) {
  const memory = useMemoryDoc(bot);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ note: PanelMemoryNote; doc: MemoryDoc } | null>(null);
  const memoryOn = bot.memoryEnabled !== false;
  const notes = memory.docs ? panelMemoryNotes(memory.docs) : null;
  const index = memory.docs?.find((doc) => doc.path === MEMORY_INDEX) ?? null;
  const open = detail === null ? null : notes?.find((note) => memoryNoteKey(note) === detail) ?? null;
  const openDoc = open ? memory.docs?.find((doc) => doc.path === open.path) ?? null : null;
  const gone = detail !== null && notes !== null && (open === null || openDoc === null);

  useEffect(() => {
    if (!gone) return;
    setConfirming(null);
    onDetail(null);
  }, [gone]);

  const change = async (save: () => Promise<boolean>) => {
    if (saving) return false;
    setSaving(true);
    setError(null);
    try {
      return await save();
    } catch (cause) {
      setError(errorText(cause, t("botPanel.library.memoryError")));
      return false;
    } finally {
      setSaving(false);
    }
  };
  const write = (doc: MemoryDoc, text: string) => change(async () => {
    const result = await saveMemoryDoc(bot.id, doc.path, text, doc.exists ? doc.hash : undefined, memory.mine);
    if (result.ok) {
      memory.setDoc(result.doc);
      return true;
    }
    await memory.reload();
    setError(t("memory.conflict.title", { name: bot.name }));
    return false;
  });
  const forget = async ({ note, doc }: { note: PanelMemoryNote; doc: MemoryDoc }) => {
    if (note.line !== null) return write(doc, withoutMemoryNote(doc.text, note.line));
    return change(async () => {
      await deleteMemoryDoc(bot.id, doc.path, memory.mine);
      await memory.reload();
      return true;
    });
  };
  const add = async () => {
    if (!index || !draft.trim()) return;
    if (await write(index, withMemoryNote(index.text, draft))) setDraft("");
  };

  const confirmDialog = (
    <ConfirmDialog
      open={confirming !== null}
      tone="danger"
      title={t("botPanel.memory.deleteTitle")}
      body={t("botPanel.memory.deleteBody", { name: bot.name })}
      confirmLabel={t("common.delete")}
      pending={saving}
      onCancel={() => setConfirming(null)}
      onConfirm={() => {
        const chosen = confirming;
        setConfirming(null);
        if (chosen) void forget(chosen).then((done) => { if (done) onDetail(null); });
      }}
    />
  );

  if (open && openDoc) {
    const parts = memoryNoteParts(open.text);
    const meta = [parts.source && t("botPanel.memory.from", { source: parts.source }), parts.date && dateFormat(parts.date)].filter(Boolean).join(" · ");
    return (
      <>
        <p data-memory-text className={cn("mx-1 whitespace-pre-wrap break-words text-[14px] leading-[1.5]", parts.inactive ? "text-ink-tertiary line-through" : "text-ink")}>{parts.body}</p>
        {meta && <p data-memory-meta className="mx-1 -mt-1 text-[12px] leading-[1.4] text-ink-tertiary">{meta}</p>}
        {error && <p className="mx-1 text-[13px] text-warning">{error}</p>}
        <div className="mx-1 mt-1">
          <button type="button" data-panel-action="delete-memory" disabled={saving} onClick={() => setConfirming({ note: open, doc: openDoc })} className={buttonCls}>
            {t("common.delete")}
          </button>
        </div>
        {confirmDialog}
      </>
    );
  }

  return (
    <>
      <Card>
        {!memoryOn ? (
          <NoteRow>{t("botPanel.library.memoryOff", { name: bot.name })}</NoteRow>
        ) : memory.error ? (
          <NoteRow tone="warn">{t("botPanel.library.memoryError")}</NoteRow>
        ) : notes === null ? (
          <NoteRow>{t("common.checking")}</NoteRow>
        ) : notes.length === 0 ? (
          <NoteRow>{t("botPanel.memory.empty")}</NoteRow>
        ) : notes.map((note) => {
          const parts = memoryNoteParts(note.text);
          return (
            <NavRow
              key={memoryNoteKey(note)}
              data-memory-note={note.line ?? note.path}
              title={<span className={cn("block truncate font-normal", parts.inactive && "text-ink-tertiary line-through")}>{parts.body}</span>}
              onClick={() => { setError(null); onDetail(memoryNoteKey(note)); }}
            />
          );
        })}
        {error && <NoteRow tone="warn">{error}</NoteRow>}
      </Card>
      {memoryOn && (
        <Card>
          <TextRow
            data-panel-form="memory-add"
            value={draft}
            placeholder={t("botPanel.memory.addPlaceholder", { name: bot.name })}
            label={t("botPanel.memory.addPlaceholder", { name: bot.name })}
            action={t("common.add")}
            disabled={saving || index === null}
            onChange={setDraft}
            onSubmit={() => void add()}
          />
        </Card>
      )}
      {confirmDialog}
    </>
  );
}

export function SkillsPage({ bot, detail, onDetail }: PageContext & DetailContext) {
  const { request: api } = useBotEditor();
  const { state, dispatch } = useStore();
  const skills = useManagedSkills(bot);
  const [source, setSource] = useState("");
  const [importing, setImporting] = useState(false);
  const [confirming, setConfirming] = useState<ManagedSkill | null>(null);
  const [imported, setImported] = useState<string[]>([]);
  const libraryOn = skillsLibraryEnabled(state.config);
  const open = detail === null || skills.loading ? null : skills.skills.find((skill) => skill.name === detail) ?? null;
  const gone = detail !== null && !skills.loading && open === null;

  useEffect(() => {
    if (gone) onDetail(null);
  }, [gone]);

  const remove = async (skill: ManagedSkill) => {
    if (skills.working) return false;
    skills.setWorking(skill.name);
    skills.setError("");
    try {
      if (skill.origin === "library") await skills.putAssignments(skill.name, true);
      else {
        await api(`/api/bots/${bot.id}/skills/${encodeURIComponent(skill.name)}`, { method: "DELETE" });
        await skills.refresh();
      }
      return true;
    } catch (cause) {
      skills.setError(errorText(cause, t("botPanel.skills.removeFailed")));
      return false;
    } finally {
      skills.setWorking("");
    }
  };
  const switchFor = (skill: ManagedSkill) => (
    <BotSwitch
      color={bot.color}
      checked={skill.enabled}
      aria-label={t("botSettings.simple.skillToggle", { name: skill.name })}
      disabled={Boolean(skills.working)}
      onClick={() => void skills.toggle(skill)}
      className="disabled:cursor-not-allowed"
    />
  );
  const reviewDialog = skills.reviewing && (
    <SkillReviewDialog
      skill={skills.reviewing.skill}
      text={skills.reviewing.text}
      error={skills.error}
      working={skills.working === skills.reviewing.skill.name}
      onCancel={() => skills.setReviewing(null)}
      onEnable={() => void skills.enableReviewed()}
    />
  );
  const confirmDialog = (
    <ConfirmDialog
      open={confirming !== null}
      tone="danger"
      title={t("botPanel.skills.removeConfirm", { name: confirming?.name ?? "" })}
      body={t("botPanel.skills.removeBody", { name: bot.name })}
      confirmLabel={t("botPanel.skills.removeAction")}
      pending={Boolean(skills.working)}
      onCancel={() => setConfirming(null)}
      onConfirm={() => {
        const skill = confirming;
        setConfirming(null);
        if (skill) void remove(skill).then((done) => { if (done) onDetail(null); });
      }}
    />
  );

  if (open) {
    return (
      <>
        <h3 className="mx-1 break-words text-[18px] font-semibold text-ink">{open.name}</h3>
        {open.description && <p data-skill-description className="mx-1 -mt-1 whitespace-pre-wrap break-words text-[14px] leading-[1.5] text-ink-secondary">{open.description}</p>}
        <Card>
          <div data-panel-row={`skill:${open.name}`} className={rowCls}>
            <RowText title={t("botSettings.simple.skillToggle", { name: open.name })} hint={open.source && open.source !== open.description ? <span className="break-all">{open.source}</span> : undefined} />
            {switchFor(open)}
          </div>
          {skills.error && !skills.reviewing && <NoteRow tone="warn">{skills.error}</NoteRow>}
        </Card>
        <div className="mx-1 mt-1">
          <button
            type="button"
            data-panel-action={`remove-skill:${open.name}`}
            disabled={Boolean(skills.working)}
            onClick={() => setConfirming(open)}
            className={buttonCls}
          >
            {t("botPanel.skills.removeAction")}
          </button>
        </div>
        {reviewDialog}
        {confirmDialog}
      </>
    );
  }
  const importSkill = async () => {
    const trimmed = source.trim();
    if (!trimmed || importing) return;
    setImporting(true);
    skills.setError("");
    setImported([]);
    try {
      const result = await api<{ imported?: SkillImportSummary[] }>(`/api/bots/${bot.id}/skills`, { method: "POST", body: JSON.stringify({ source: trimmed }) });
      setImported(skillImportLines(result.imported ?? []));
      setSource("");
      await skills.refresh();
    } catch (cause) {
      skills.setError(errorText(cause, t("botPanel.skills.importFailed")));
    } finally {
      setImporting(false);
    }
  };
  const browse = () => {
    if (libraryOn) {
      dispatch({ type: "toggleSettings", open: false });
      dispatch({ type: "toggleAppSettings", open: true, section: "skills" });
      return;
    }
    void openExternalLink(SKILLS_SITE);
  };

  return (
    <>
      <Card>
        {skills.loading ? (
          <NoteRow>{t("skills.loading")}</NoteRow>
        ) : skills.skills.length === 0 ? (
          <NoteRow>{t("botSettings.simple.noSkills")}</NoteRow>
        ) : skills.skills.map((skill) => (
          <div key={skill.name} data-panel-row={`skill:${skill.name}`} className="flex items-center">
            <button
              type="button"
              data-panel-open={`skill:${skill.name}`}
              onClick={() => { skills.setError(""); onDetail(skill.name); }}
              className="flex min-h-[46px] min-w-0 flex-1 flex-col justify-center py-[11px] pl-3.5 pr-2.5 text-left hover:bg-ink/[0.03]"
            >
              <span className="truncate text-[14px] font-medium text-ink">{skill.name}</span>
              {(skill.description || skill.source) && <span className="mt-px truncate text-[13px] leading-[1.35] text-ink-secondary">{skill.description || skill.source}</span>}
            </button>
            <span className="flex shrink-0 items-center pr-3.5">{switchFor(skill)}</span>
          </div>
        ))}
        {skills.error && !skills.reviewing && <NoteRow tone="warn">{skills.error}</NoteRow>}
      </Card>
      <Card>
        <TextRow
          data-panel-form="skill-import"
          value={source}
          placeholder={t("botPanel.skills.importPlaceholder")}
          label={t("skills.import.label")}
          action={importing ? t("skills.import.importing") : t("common.add")}
          disabled={importing}
          onChange={setSource}
          onSubmit={() => void importSkill()}
        />
        {imported.map((line) => <NoteRow key={line}>{line}</NoteRow>)}
        <LinkRow data-panel-link="browse-skills" onClick={browse}>{t("botPanel.skills.browse")}</LinkRow>
      </Card>
      {reviewDialog}
      {confirmDialog}
    </>
  );
}

export function FolderPage({ bot }: PageContext) {
  const { capabilities } = useDesktopCapabilities();
  const home = capabilities.host?.homeDir;
  const { draft, setDraft, error, saving, canPick, save, pick } = useWorkingFolder(bot);
  const [choosing, setChoosing] = useState(false);
  const chosen = Boolean(bot.cwd) || choosing;

  const choose = () => {
    if (canPick) {
      void pick();
      return;
    }
    setChoosing(true);
  };

  return (
    <>
      <Card>
        <RadioRow
          data-panel-choice="private"
          title={t("botPanel.folder.own")}
          hint={t("botPanel.folder.ownHint")}
          checked={!chosen}
          disabled={saving}
          onClick={() => {
            setChoosing(false);
            if (bot.cwd) void save(null);
          }}
        />
        <RadioRow
          data-panel-choice="pick"
          title={t("botPanel.folder.pick")}
          hint={t("botPanel.folder.pickHint")}
          checked={chosen}
          disabled={saving}
          onClick={() => { if (!bot.cwd) choose(); }}
        />
      </Card>
      {chosen && (
        <Card>
          {canPick ? (
            <div className={rowCls}>
              <div className="min-w-0 flex-1 truncate rounded-lg border border-hairline/40 bg-inset px-3 py-2 font-mono text-[13px] text-ink" title={bot.cwd}>
                {bot.cwd ? shortPath(bot.cwd, home) : <span className="text-ink-secondary">{t("botAccess.folder.private")}</span>}
              </div>
              <button type="button" data-panel-action="pick-folder" disabled={saving} onClick={() => void pick()} className={buttonCls}>
                <FolderOpen size={14} aria-hidden="true" />
                {t("botAccess.folder.choose")}
              </button>
            </div>
          ) : (
            <form
              data-panel-form="folder-path"
              className={rowCls}
              onSubmit={(event) => {
                event.preventDefault();
                const path = (draft ?? bot.cwd ?? "").trim();
                if (path) void save(path);
              }}
            >
              <input
                value={draft ?? bot.cwd ?? ""}
                placeholder={t("botAccess.folder.placeholder")}
                aria-label={t("botAccess.folder.title")}
                onChange={(event) => setDraft(event.target.value)}
                className="h-8 min-w-0 flex-1 rounded-lg border border-hairline bg-inset px-2.5 font-mono text-[13px] text-ink outline-none placeholder:text-ink-tertiary focus:border-accent-border"
              />
              <button type="submit" disabled={saving || draft === null} className={buttonCls}>{t("botAccess.folder.save")}</button>
            </form>
          )}
          {error && <NoteRow tone="warn">{error}</NoteRow>}
        </Card>
      )}
    </>
  );
}

export function BrowserPage({ bot, derived }: PageContext) {
  const openComputer = useOpenComputer(bot);
  return <BrowserLogins bot={bot} browserEnabled={derived.browserEnabled} onOpenBrowser={() => openComputer("browser")} />;
}

export function BackupsPage({ bot, derived }: PageContext) {
  return <BackupAis bot={bot} onChange={(fallback) => derived.patch({ fallback })} />;
}

export function BotApiPage({ bot }: PageContext) {
  return <BotApiCard bot={bot} webhooksLink titled={false} className="mt-3.5" />;
}

export function PageBody({ page, onOpen, detail = null, onDetail = () => {}, editingInstructions, onEditInstructions, ...context }: PageContext & Partial<DetailContext> & {
  page: SimplePageId;
  onOpen?: (page: SimplePageId) => void;
  editingInstructions?: boolean;
  onEditInstructions?: (open: boolean) => void;
}): ReactNode {
  switch (page) {
    case "settings":
      return <SettingsPage {...context} onOpen={onOpen} editingInstructions={editingInstructions} onEditInstructions={onEditInstructions} />;
    case "where":
      return <WherePage {...context} />;
    case "apps":
      return <AppsPage {...context} />;
    case "backups":
      return <BackupsPage {...context} />;
    case "botapi":
      return <BotApiPage {...context} />;
    case "routines":
      return <RoutinesPage {...context} />;
    case "memory":
      return <MemoryPage {...context} detail={detail} onDetail={onDetail} />;
    case "skills":
      return <SkillsPage {...context} detail={detail} onDetail={onDetail} />;
    case "folder":
      return <FolderPage {...context} />;
    case "browser":
      return <BrowserPage {...context} />;
  }
}
