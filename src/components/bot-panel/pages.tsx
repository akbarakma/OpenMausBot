import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, FileText, FolderOpen, Maximize2, Minimize2, Plus, Server } from "lucide-react";

import { appSwitchPatch } from "@/lib/bot-app-access";
import { cn } from "@/lib/cn";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import { skillsLibraryEnabled } from "@/lib/feature-flags";
import { activeLocale, t } from "@/lib/i18n";
import { mcpServersForBot, mcpServersOfBot, mcpSwitch, useMcpServers } from "@/lib/mcp-servers";
import { deleteMemoryDoc, MEMORY_INDEX, saveMemoryDoc, type MemoryDoc } from "@/lib/memory";
import { openExternalLink } from "@/lib/app-links";
import type { SkillImportSummary } from "../../../shared/skill-import";
import { shortPath } from "@/lib/short-path";
import { skillImportLines } from "@/lib/skill-import";
import { useStore, type Bot } from "@/state/store";
import { ActivityList } from "../ActivityPanel";
import { ConfirmDialog } from "../ConfirmDialog";
import { useDesktopCapabilities } from "../DesktopCapabilities";
import { connectAppFromBot } from "../AppGrantPrompt";
import { ServiceIcon } from "../ServiceIcon";
import { useWorkingFolder } from "../bot-settings/AccessSection";
import { BotApiCard } from "../bot-settings/BotApiCard";
import { useBotEditor } from "../bot-settings/BotEditorContext";
import { inputCls } from "../bot-settings/field";
import { ConflictNotice } from "../bot-settings/MemorySection";
import { OrgSkillsCard } from "../bot-settings/OrgSkillsCard";
import { SkillReviewDialog, skillSwitchOn, useManagedSkills, type ManagedSkill } from "../bot-settings/SkillsSection";
import { useBotApps, type BotApp } from "../bot-settings/useBotApps";
import { useChoosesVisibility, VisibilitySection } from "../bot-settings/VisibilitySection";
import type { useBotSettingsDerived } from "../bot-settings/useBotSettingsDerived";
import { AutomationsPage } from "./AutomationsPage";
import { BackupAis } from "./BackupAis";
import { BrowserLogins } from "./browser-logins";
import { useOpenComputer, WherePage } from "./ComputerTab";
import { MadeHere } from "./LibraryTab";
import { SettingsPage } from "./SettingsPage";
import { memoryNoteKey, memoryNoteParts, panelMemoryNotes, withMemoryNote, withoutMemoryNote, type PanelMemoryNote } from "./memory-notes";
import type { SimplePageId } from "./page-registry";
import { BotSwitch, buttonCls, Card, ColRow, ItemRow, LinkRow, NavRow, NoteRow, openRowButtonCls, openRowCls, RadioRow, RowIcon, rowCls, RowText, switchRowCls, TextRow, TrashButton } from "./rows";
import { MemoryUpkeepCards } from "./MemoryUpkeepCards";
import { useMemoryDoc } from "./use-memory-doc";
import { useTeamMemoryEntries } from "../conversation-share/conversation-share";

type Derived = ReturnType<typeof useBotSettingsDerived>;

const DataPanel = lazy(() => import("../data/DataPanel").then((module) => ({ default: module.DataPanel })));

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

const homePath = (path: string, home: string | undefined) => shortPath(path, home).replace(/^(?:\/home\/[^/]+|\/Users\/[^/]+|\/root)(?=\/|$)/, "~");

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
          <label key={app.slug} data-simple-app={app.slug} className={switchRowCls}>
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
          </label>
        ))}
      </Card>
      {(servers.length > 0 || mcpError) && (
        <Card label={t("connectors.tab.mcp")}>
          {mcpError && <NoteRow>{t("botAccess.mcpRefreshError")}</NoteRow>}
          {servers.map((server) => (
            <label key={server.name} data-simple-mcp={server.name} className={switchRowCls}>
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
            </label>
          ))}
        </Card>
      )}
      <Card>
        <LinkRow
          data-panel-link="add-app"
          icon={Plus}
          onClick={() => connectAppFromBot(dispatch, bot.id)}
        >
          {t("botPanel.apps.connectAnother")}
        </LinkRow>
      </Card>
    </>
  );
}

/** MEMORY.md's bullets, and on a Team Cloud the person's own notes. Every write goes through the memory file route with
 * the hash it was read at, so a note the bot added meanwhile is never lost: a conflict re-reads and asks again. */
export function MemoryPage({ bot, detail, onDetail }: PageContext & DetailContext) {
  const memory = useMemoryDoc(bot);
  const teamSaved = useTeamMemoryEntries(bot.id, memory.mine && bot.memoryEnabled !== false && !bot.defaultBot?.person, memory.docs);
  const [draft, setDraft] = useState("");
  const [asText, setAsText] = useState<{ botId: string; doc: MemoryDoc } | null>(null);
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
  useEffect(() => setAsText(null), [bot.id, memoryOn]);

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
        <p data-memory-text className="mx-1 whitespace-pre-wrap break-words text-[14px] leading-[1.5] text-ink">{parts.body}</p>
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

  if (memoryOn && asText?.botId === bot.id) {
    return (
      <MemoryTextEditor
        bot={bot}
        doc={asText.doc}
        mine={memory.mine}
        onDone={(saved) => {
          if (saved) memory.setDoc(saved);
          setAsText(null);
          setError(null);
        }}
      />
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
        ) : notes.length === 0 && teamSaved.entries.length === 0 ? (
          <NoteRow>{t("botPanel.memory.empty")}</NoteRow>
        ) : notes.map((note) => {
          return (
            <NavRow
              key={memoryNoteKey(note)}
              data-memory-note={note.line ?? note.path}
              title={<span className="block truncate font-normal">{memoryNoteParts(note.text).body}</span>}
              onClick={() => { setError(null); onDetail(memoryNoteKey(note)); }}
            />
          );
        })}
        {memoryOn && !memory.error && notes !== null && teamSaved.entries.map((entry) => (
          <div key={entry.id} data-team-memory-entry={entry.id} className={rowCls}>
            <div className="min-w-0 flex-1 text-[13px] leading-[1.45] text-ink">
              {entry.text}
              {entry.yours && <span className="block text-[12px] text-ink-secondary">{t("teamMemorySave.yours")}</span>}
            </div>
            <TrashButton label={t("common.delete")} disabled={saving} onClick={() => void change(async () => { await teamSaved.remove(entry.id); return true; })} />
          </div>
        ))}
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
          {index && (
            <LinkRow data-panel-link="memory-text" icon={FileText} onClick={() => setAsText({ botId: bot.id, doc: index })}>
              {t("botPanel.memory.editText")}
            </LinkRow>
          )}
        </Card>
      )}
      {memoryOn && !memory.mine && <MemoryUpkeepCards bot={bot} onChanged={memory.reload} />}
      {confirmDialog}
    </>
  );
}

/** The whole MEMORY.md as text, saved against the hash it was opened at, so a note the bot writes meanwhile is a
 * conflict to settle, never silently lost: Reload shows the bot's version and keeps what the person typed beside it. */
function MemoryTextEditor({ bot, doc, mine, onDone }: {
  bot: Bot;
  doc: MemoryDoc;
  mine: boolean;
  onDone: (saved: MemoryDoc | null) => void;
}) {
  // A file not written yet has the empty file's hash, so the bot creating it meanwhile is a conflict too.
  const [base, setBase] = useState({ text: doc.text, hash: doc.hash });
  const [text, setText] = useState(doc.text);
  const [conflict, setConflict] = useState<{ current: string; currentHash: string } | null>(null);
  const [savedDraft, setSavedDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Full window shows the same text over the whole app; going in or out keeps what was typed.
  const [wide, setWide] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) firstRender.current = false;
    else field.current?.focus();
  }, [wide]);
  // The file is saved either way; a save that lands after the person moved to another bot must not show in that bot's list.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const save = async (expectedHash: string) => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveMemoryDoc(bot.id, doc.path, text, expectedHash, mine);
      if (!mounted.current) return;
      if (result.ok) onDone(result.doc);
      else setConflict({ current: result.current, currentHash: result.currentHash });
    } catch (cause) {
      setError(errorText(cause, t("botPanel.library.memoryError")));
    } finally {
      setSaving(false);
    }
  };
  const reload = () => {
    if (!conflict) return;
    // A second Reload keeps the first kept draft too.
    setSavedDraft((kept) => (kept === null || kept === text ? text : `${kept}\n\n${text}`));
    setBase({ text: conflict.current, hash: conflict.currentHash });
    setText(conflict.current);
    setConflict(null);
  };

  const body = (
    <>
        {conflict && <ConflictNotice botName={bot.name} busy={saving} onReload={reload} onOverwrite={() => void save(conflict.currentHash)} />}
        <textarea
          ref={field}
          data-memory-text=""
          className={cn(inputCls, wide ? "min-h-0 flex-1 resize-none" : "min-h-[280px] resize-y", "font-mono text-[13px] leading-relaxed")}
          value={text}
          placeholder={t("memory.indexPlaceholder")}
          aria-label={t("memory.botMemory")}
          readOnly={saving}
          onChange={(event) => setText(event.target.value)}
        />
        {error && <div className="text-[13px] text-warning">{error}</div>}
        {savedDraft !== null && (
          <div data-memory-draft="">
            <div className="mb-1 text-[12px] text-ink-secondary">{t("memory.unsavedDraft")}</div>
            <pre className="max-h-[160px] overflow-auto whitespace-pre-wrap rounded-lg border border-hairline/40 bg-inset p-3 font-mono text-[12px] leading-relaxed text-ink">
              {savedDraft}
            </pre>
            <button type="button" className={cn(buttonCls, "mt-1")} onClick={() => setSavedDraft(null)}>{t("memory.dismissDraft")}</button>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" data-memory-wide="" className={cn(buttonCls, "mr-auto inline-flex items-center gap-1.5")} onClick={() => setWide(!wide)}>
            {wide ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
            {t(wide ? "botPanel.memory.exitFullWindow" : "botPanel.memory.fullWindow")}
          </button>
          <button type="button" className={buttonCls} disabled={saving} onClick={() => onDone(null)}>{t("common.cancel")}</button>
          <button
            type="button"
            data-panel-done="memory-text"
            className={buttonCls}
            disabled={saving || text === base.text}
            onClick={() => void save(base.hash)}
          >
            {saving ? t("memory.saving") : t("memory.save")}
          </button>
        </div>
    </>
  );

  if (wide) return <MemoryFullWindow label={t("memory.botMemory")} onClose={() => setWide(false)}>{body}</MemoryFullWindow>;
  return (
    <Card>
      <ColRow data-panel-row="memory-text">{body}</ColRow>
    </Card>
  );
}

/** The memory text over the whole app window, so a long MEMORY.md is easy to read and edit; Escape goes back to the panel. */
function MemoryFullWindow({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalDialog(dialogRef, onClose);
  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-memory-full-window=""
      className="fixed inset-0 z-[65] flex flex-col gap-3 bg-app p-4 outline-none"
    >
      {children}
    </div>,
    document.body,
  );
}

export function SkillsPage({ bot, detail, onDetail }: PageContext & DetailContext) {
  const { request: api } = useBotEditor();
  const { state, dispatch } = useStore();
  const skills = useManagedSkills(bot);
  const [source, setSource] = useState("");
  const [importing, setImporting] = useState(false);
  const [confirming, setConfirming] = useState<ManagedSkill | null>(null);
  const [reading, setReading] = useState<{ skill: ManagedSkill; text: string } | null>(null);
  const [imported, setImported] = useState<string[]>([]);
  const [showGlobal, setShowGlobal] = useState(false);
  const home = useDesktopCapabilities().capabilities.host?.homeDir;
  const libraryOn = skillsLibraryEnabled(state.config);
  const own = skills.skills.filter((skill) => skill.origin !== "native" && skill.origin !== "project");
  const project = skills.skills.filter((skill) => skill.origin === "project");
  const native = skills.skills.filter((skill) => skill.origin === "native");
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
      await api(`/api/bots/${bot.id}/skills/${encodeURIComponent(skill.name)}`, { method: "DELETE" });
      await skills.refresh();
      return true;
    } catch (cause) {
      skills.setError(errorText(cause, t("botPanel.skills.removeFailed")));
      return false;
    } finally {
      skills.setWorking("");
    }
  };
  const showSkill = async (skill: ManagedSkill) => {
    skills.setError("");
    try {
      const result = (await api(skill.origin === "library" ? `/api/skills-library/${encodeURIComponent(skill.name)}` : `/api/bots/${bot.id}/skills/${encodeURIComponent(skill.name)}`)) as { text?: string };
      if (!result.text) throw new Error(t("skills.error.contentsRelearn"));
      setReading({ skill, text: result.text });
    } catch (cause) {
      skills.setError(errorText(cause, t("skills.error.contentsRelearn")));
    }
  };
  const switchFor = (skill: ManagedSkill) => (
    <BotSwitch
      color={bot.color}
      checked={skillSwitchOn(skill)}
      aria-label={t("botSettings.simple.skillToggle", { name: skill.name })}
      disabled={Boolean(skills.working)}
      onClick={() => void skills.toggle(skill)}
      className="disabled:cursor-not-allowed"
    />
  );
  const skillRow = (skill: ManagedSkill, control: ReactNode) => (
    <div key={skill.name} data-panel-row={`skill:${skill.name}`} className={openRowCls}>
      <button
        type="button"
        data-panel-open={`skill:${skill.name}`}
        onClick={() => { skills.setError(""); onDetail(skill.name); }}
        className={cn(openRowButtonCls, "flex-col items-stretch gap-0")}
      >
        <span className="truncate text-[14px] font-medium text-ink">{skill.name}</span>
        {(skill.description || skill.source) && <span className="mt-px truncate text-[13px] leading-[1.35] text-ink-secondary">{skill.description || skill.source}</span>}
      </button>
      {control}
    </div>
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
      title={t(confirming?.origin === "library" ? "skills.unassignConfirm" : "botPanel.skills.removeConfirm", { name: confirming?.name ?? "" })}
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
    const openUnlisted = open.enabled && open.listed === false;
    return (
      <>
        <h3 className="mx-1 break-words text-[18px] font-semibold text-ink">{open.name}</h3>
        {open.description && <p data-skill-description className="mx-1 -mt-1 whitespace-pre-wrap break-words text-[14px] leading-[1.5] text-ink-secondary">{open.description}</p>}
        <Card>
          {open.origin === "native" ? (
            <div data-panel-row={`skill:${open.name}`} className={rowCls}>
              <RowText
                title={t("botPanel.skills.nativeTitle", { name: bot.name })}
                hint={<><span className="my-0.5 block break-all font-mono text-[12px]">{homePath(`${open.source}/${open.name}`, home)}</span>{t("botPanel.skills.nativeHint")}</>}
              />
            </div>
          ) : (
            <div data-panel-row={`skill:${open.name}`} className={openRowCls}>
              <button
                type="button"
                data-panel-open={`skill-text:${open.name}`}
                onClick={() => void showSkill(open)}
                className={openRowButtonCls}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">{t("botSettings.simple.skillToggle", { name: open.name })}</span>
                  {openUnlisted && <span data-skill-unlisted className="mt-px block truncate text-[13px] leading-[1.35] text-ink-secondary">{t("skills.foundWhenNeeded")}</span>}
                </span>
              </button>
              {switchFor(open)}
            </div>
          )}
          {skills.error && !skills.reviewing && <NoteRow tone="warn">{skills.error}</NoteRow>}
        </Card>
        {open.origin !== "native" && open.origin !== "imported" && <div className="mx-1 mt-1">
          <button
            type="button"
            data-panel-action={`remove-skill:${open.name}`}
            disabled={Boolean(skills.working)}
            onClick={() => setConfirming(open)}
            className={buttonCls}
          >
            {t("botPanel.skills.removeAction")}
          </button>
        </div>}
        {reading && (
          <SkillReviewDialog
            skill={reading.skill}
            text={reading.text}
            error=""
            working={false}
            read
            onCancel={() => setReading(null)}
            onEnable={() => {}}
          />
        )}
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
      <Card label={t("botPanel.skills.ownTitle", { name: bot.name })} anchor="own-skills">
        {skills.loading ? (
          <NoteRow>{t("skills.loading")}</NoteRow>
        ) : own.length === 0 ? (
          <NoteRow>{t("botPanel.skills.ownEmpty", { name: bot.name })}</NoteRow>
        ) : own.map((skill) => skillRow(skill, switchFor(skill)))}
        {skills.error && !skills.reviewing && <NoteRow tone="warn">{skills.error}</NoteRow>}
      </Card>
      {project.length > 0 && (
        <Card label={t("botPanel.skills.project")} anchor="project-skills">
          {project.map((skill) => (
            <ItemRow key={skill.name} data-panel-row={`project-skill:${skill.name}`} title={skill.name} hint={skill.description || skill.source} />
          ))}
        </Card>
      )}
      {native.length > 0 && (
        <Card anchor="global-skills">
          <button
            type="button"
            data-panel-action="toggle-global-skills"
            aria-expanded={showGlobal}
            onClick={() => setShowGlobal((shown) => !shown)}
            className={cn(rowCls, "w-full cursor-pointer text-left hover:bg-ink/[0.03]")}
          >
            <RowText
              title={t("botPanel.skills.globalTitle")}
              hint={t("botPanel.skills.globalHint", { name: bot.name })}
            />
            <span className="shrink-0 text-[13px] text-ink-secondary">{native.length}</span>
            <ChevronRight size={15} className={cn("shrink-0 text-ink-tertiary transition-transform", showGlobal && "rotate-90")} aria-hidden="true" />
          </button>
          {showGlobal && native.map((skill) => skillRow(skill, <span className="mr-[5px] shrink-0 text-[13px] text-ink-secondary">{t("botPanel.skills.alwaysOn")}</span>))}
        </Card>
      )}
      <OrgSkillsCard bot={bot} onAdded={() => void skills.refresh()} />
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
  const pinned = bot.tasks?.find((task) => task.threadId === bot.threadId)?.cwd;

  const choose = () => {
    if (canPick) {
      void pick();
      return;
    }
    setChoosing(true);
  };

  return (
    <>
      {pinned !== undefined && (
        <Card>
          <div data-panel-row="chat-folder" className={rowCls}>
            <RowIcon icon={FolderOpen} />
            <RowText title={pinned ? <span className="block truncate font-mono text-[13px]" title={pinned}>{shortPath(pinned, home)}</span> : t("computer.files.homeFolder")} hint={t("computer.files.pinnedFolderHint")} />
          </div>
        </Card>
      )}
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

export function DataPage({ bot }: PageContext) {
  const { state, dispatch } = useStore();
  const focus = state.dataResultFocus?.botId === bot.id && !state.dataResultFocus.consumed ? state.dataResultFocus : null;
  const [requested, setRequested] = useState<{ id: string; requestId: number } | undefined>(undefined);
  useEffect(() => {
    if (!focus) return;
    setRequested(focus.id === undefined ? undefined : { id: focus.id, requestId: focus.requestId });
    dispatch({ type: "dataResultFocusConsumed", requestId: focus.requestId });
  }, [focus, dispatch]);
  // shortcut: a fixed height under the page header, because the panel body scrolls and DataPanel fills its parent.
  return (
    <div className="flex h-[calc(100dvh-210px)] min-h-[360px] flex-col overflow-hidden rounded-[12px] ring-1 ring-inset ring-ink/[0.06]">
      <Suspense fallback={<div className="flex flex-1 items-center justify-center text-[13px] text-ink-secondary" role="status">{t("data.loading")}</div>}>
        <DataPanel key={bot.id} bot={bot} requestedCard={requested} />
      </Suspense>
    </div>
  );
}

export function FilesPage({ bot }: PageContext) {
  return <MadeHere bot={bot} folders />;
}

export function ActivityPage({ bot, refresh }: PageContext & { refresh: number }) {
  return <ActivityList bot={bot} className="-ml-4 -mr-2 [&_button]:pr-2" refresh={refresh} dayBg="bg-app" toolbar={() => null} />;
}

export function BackupsPage({ bot, derived }: PageContext) {
  return <BackupAis bot={bot} onChange={(fallback) => derived.patch({ fallback })} />;
}

export function BotApiPage({ bot }: PageContext) {
  return <BotApiCard bot={bot} webhooksLink titled={false} className="mt-3.5" />;
}

function VisibilityPage({ bot }: PageContext) {
  return useChoosesVisibility() ? <VisibilitySection bot={bot} /> : null;
}

export function PageBody({ page, onOpen, detail = null, onDetail = () => {}, editingInstructions, onEditInstructions, activityRefresh = 0, ...context }: PageContext & Partial<DetailContext> & {
  page: SimplePageId;
  /** Counts the Activity page header's Reload presses. */
  activityRefresh?: number;
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
      return <AutomationsPage {...context} />;
    case "visibility":
      return <VisibilityPage {...context} />;
    case "memory":
      return <MemoryPage {...context} detail={detail} onDetail={onDetail} />;
    case "skills":
      return <SkillsPage {...context} detail={detail} onDetail={onDetail} />;
    case "folder":
      return <FolderPage {...context} />;
    case "browser":
      return <BrowserPage {...context} />;
    case "data":
      return <DataPage {...context} />;
    case "files":
      return <FilesPage {...context} />;
    case "activity":
      return <ActivityPage {...context} refresh={activityRefresh} />;
  }
}
