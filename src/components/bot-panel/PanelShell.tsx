import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { RefreshCw, Settings, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { Bot, BotSettingsSection } from "@/state/store";
import { ChatShareMenu } from "@/components/ChatMoreMenu";
import { useCaptionChrome } from "../DesktopCapabilities";
import type { useBotSettingsDerived } from "../bot-settings/useBotSettingsDerived";
import { AvatarEditorCard } from "./AvatarEditorCard";
import { PAGES, type PanelTarget, type SimplePageId } from "./page-registry";
import { PanelHome } from "./PanelHome";
import { PageBody, pageSurfaceCls } from "./pages";
import { linkTarget, usePanelLink, type PanelLink } from "./panel-link";
import { PanelHero } from "./PanelHero";
import { buttonCls, PageHeader, roundButtonCls } from "./rows";

/** The page stack each bot's panel last showed, and how far each of its pages was scrolled, so the panel comes back
 * where it was after something covered it, and Back returns to the same spot. */
const lastStack = new Map<string, SimplePageId[]>();
const lastScroll = new Map<string, Map<string, number>>();

const scrollKey = (page: SimplePageId | null, detail: string | null) => `${page ?? ""}\n${detail ?? ""}`;

function initialTarget(section: BotSettingsSection | null, link: PanelLink | null): PanelTarget | null {
  return section ? linkTarget(section, link) : null;
}

export function BotPanel({ bot, derived, linkedSection, onClose }: {
  bot: Bot;
  derived: ReturnType<typeof useBotSettingsDerived>;
  linkedSection: BotSettingsSection | null;
  onClose: () => void;
}) {
  const { dragProps } = useCaptionChrome();
  const link = usePanelLink();
  const [stack, setStack] = useState<SimplePageId[]>(() => {
    const target = initialTarget(linkedSection, link);
    return target ? (target.page ? [target.page] : []) : lastStack.get(bot.id) ?? [];
  });
  const [anchor, setAnchor] = useState<string | null>(() => initialTarget(linkedSection, link)?.anchor ?? null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingInstructions, setEditingInstructions] = useState(() => Boolean(initialTarget(linkedSection, link)?.editInstructions));
  const [detail, setDetail] = useState<string | null>(null);
  const [activityRefresh, setActivityRefresh] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const page = stack.at(-1) ?? null;
  const scrolls = lastScroll.get(bot.id) ?? new Map<string, number>();
  lastScroll.set(bot.id, scrolls);
  const restoreTo = useRef<number | null>(scrolls.get(scrollKey(page, detail)) ?? null);

  const scrollTop = () => { restoreTo.current = 0; };
  const go = (target: PanelTarget) => {
    setStack(target.page ? [target.page] : []);
    setAnchor(target.anchor ?? null);
    setEditorOpen(false);
    setEditingInstructions(Boolean(target.editInstructions));
    setDetail(null);
    scrollTop();
  };
  const openPage = (next: SimplePageId) => {
    setStack((current) => [...current, next]);
    setEditorOpen(false);
    setDetail(null);
    scrollTop();
  };
  const closeEditor = () => {
    setEditorOpen(false);
    // The card held focus: hand it back to the avatar that opened it, before the card goes, not to the page body.
    editorRef.current?.querySelector<HTMLElement>("[data-panel-avatar]")?.focus();
  };
  const openDetail = (key: string | null) => {
    setDetail(key);
    scrollTop();
  };
  const back = () => {
    const to = detail !== null ? scrollKey(page, null) : scrollKey(stack.at(-2) ?? null, null);
    restoreTo.current = scrolls.get(to) ?? 0;
    if (detail !== null) setDetail(null);
    else setStack((current) => current.slice(0, -1));
  };

  useLayoutEffect(() => {
    if (restoreTo.current === null) return;
    bodyRef.current?.scrollTo({ top: restoreTo.current });
    restoreTo.current = null;
  }, [page, detail]);

  // A new link re-runs this even when it names the section already linked, so a repeated link lands there again.
  useEffect(() => {
    if (linkedSection) go(linkTarget(linkedSection, link));
  }, [linkedSection, link]);

  useEffect(() => {
    lastStack.set(bot.id, stack);
  }, [bot.id, stack]);

  useEffect(() => {
    if (!anchor) return;
    bodyRef.current?.querySelector(`[data-panel-card="${anchor}"]`)?.scrollIntoView({ block: "start" });
    setAnchor(null);
  }, [anchor, page]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const target = event.target as Partial<Element> | null;
    const inDialog = typeof target?.closest === "function" ? target.closest('[role="dialog"], [role="alertdialog"]') : null;
    // A dialog of its own (one this panel opened, perhaps portaled) owns its Escape; the settings dialog this panel
    // sits in, and the avatar editor, do not.
    const ownDialog = inDialog && !inDialog.contains(event.currentTarget) && inDialog !== editorRef.current && !editorRef.current?.contains(inDialog);
    if (ownDialog) return;
    if (editorOpen) closeEditor();
    else if (detail !== null || stack.length > 0) back();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const backLabel = page && detail !== null ? t(PAGES[page].title, { name: bot.name })
    : stack.length > 1 ? t(PAGES[stack[stack.length - 2]!].title, { name: bot.name }) : bot.name;

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <div {...dragProps} className="flex h-[50px] shrink-0 items-start justify-end gap-2.5 px-[13px] pt-[13px]">
        <ChatShareMenu bot={bot} className={roundButtonCls} />
        <button
          type="button"
          data-panel-gear
          aria-label={t("botPanel.page.settings")}
          title={t("botPanel.page.settings")}
          aria-current={page === "settings" ? "page" : undefined}
          onClick={() => go({ page: "settings" })}
          className={roundButtonCls}
        >
          <Settings size={16} className="pointer-events-none" />
        </button>
        <button type="button" onClick={onClose} aria-label={t("botSettings.simple.close")} className={roundButtonCls}>
          <X size={16} className="pointer-events-none" />
        </button>
      </div>

      <div
        ref={bodyRef}
        data-panel-body
        onScroll={(event) => scrolls.set(scrollKey(page, detail), event.currentTarget.scrollTop)}
        className="@container relative min-h-0 flex-1 overflow-y-auto pb-7 pl-4 pr-2 [scrollbar-gutter:stable]"
      >
        {page === null ? (
          <>
            <div className="relative mt-3.5" ref={editorRef}>
              <PanelHero
                bot={bot}
                patch={derived.patch}
                editorOpen={editorOpen}
                onToggleEditor={() => setEditorOpen((open) => !open)}
              />
              {editorOpen && (
                <>
                  <div className="fixed inset-0 z-20" aria-hidden="true" data-panel-scrim onClick={closeEditor} />
                  <AvatarEditorCard bot={bot} onPatch={derived.patch} onClose={closeEditor} />
                </>
              )}
            </div>
            <PanelHome bot={bot} onOpen={openPage} />
          </>
        ) : (
          <div data-panel-page-view={page}>
            <span id="bot-settings-title" className="sr-only">{bot.name}</span>
            <PageHeader
              back={backLabel}
              title={detail === null ? t(PAGES[page].title, { name: bot.name }) : undefined}
              intro={detail === null && PAGES[page].intro ? t(PAGES[page].intro, { name: bot.name }) : undefined}
              onBack={back}
              action={page === "activity" && detail === null ? (
                <button type="button" data-panel-action="reload-activity" onClick={() => setActivityRefresh((count) => count + 1)} className={buttonCls}>
                  <RefreshCw size={14} aria-hidden="true" />
                  {t("activity.panel.reload")}
                </button>
              ) : undefined}
            />
            <div className={cn("mt-4", pageSurfaceCls)}>
              <PageBody
                page={page}
                bot={bot}
                derived={derived}
                onOpen={openPage}
                detail={detail}
                onDetail={openDetail}
                editingInstructions={editingInstructions}
                onEditInstructions={setEditingInstructions}
                activityRefresh={activityRefresh}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
