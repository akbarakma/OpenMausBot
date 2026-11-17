import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { BellOff, ChevronDown, ChevronLeft, ChevronUp, Inbox, Maximize2, Minimize2, Search, X } from "lucide-react";
import type { InboxRow } from "../../../shared/inbox";
import { cn } from "@/lib/cn";
import { useAdvancedMode } from "@/lib/interface-mode";
import { t } from "@/lib/i18n";
import { PHONE_LAYOUT, useMediaQuery } from "@/lib/use-media-query";
import { dayLabel, localDay } from "@/lib/transcript-derivations";
import { closeInbox, markAllInboxRead, muteInboxAutomation, readInboxLine, readInboxRow, useInboxMarkingAll, useInboxPanel, useInboxView, widenInbox } from "@/state/inbox";
import { InboxActive } from "./InboxActive";
import { InboxReading } from "./InboxReading";
import { InboxRowItem } from "./InboxRow";
import { matchesSearch, nextAfter } from "./inbox-answer";
import { listedRows, waitingCount } from "./inbox-view";
import { useInboxActions } from "./use-inbox-actions";
import { roundButtonCls } from "../bot-panel/rows";

const NAV_BUTTON = "flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-secondary hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";


export function InboxPanel() {
  const view = useInboxView();
  const panel = useInboxPanel();
  const markingAll = useInboxMarkingAll();
  const phone = useMediaQuery(PHONE_LAYOUT);
  const simple = !useAdvancedMode();
  const { run } = useInboxActions(view);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    if (panel.reading) readInboxLine(null);
    else closeInbox();
  };
  const reading = panel.reading ? view?.rows.find((row) => row.id === panel.reading) : undefined;
  const listRef = useRef<HTMLDivElement>(null);
  const listTop = useRef(0);
  const lastRead = useRef<string | null>(null);
  const open = (row: InboxRow) => { lastRead.current = row.id; readInboxRow(row); readInboxLine(row.id); };
  useLayoutEffect(() => {
    const list = listRef.current;
    if (panel.reading || !list) return;
    list.scrollTop = listTop.current;
    list.querySelector(`[data-last-read]`)?.scrollIntoView({ block: "nearest" });
  }, [panel.reading]);

  const [toast, setToast] = useState<{ id: string; name: string } | { failed: true } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6_000);
    return () => clearTimeout(timer);
  }, [toast]);
  const mute = async (automation: { id: string; name: string }) => {
    readInboxLine(null);
    setToast(await muteInboxAutomation(automation.id, true) ? automation : { failed: true });
  };
  const unmute = (id: string) => { setToast(null); void muteInboxAutomation(id, false); };
  const rows = listedRows(view).filter((row) => matchesSearch(row, query));
  const ids = rows.map((row) => row.id);
  const at = reading ? ids.indexOf(reading.id) : -1;

  const order = useRef<string[]>([]);
  if (at >= 0) order.current = ids;
  const waited = useRef<string | null>(null);
  useEffect(() => {
    if (!reading) { waited.current = null; return; }
    if (reading.tab !== "done") { waited.current = reading.id; return; }
    if (waited.current !== reading.id) return;
    waited.current = null;
    const next = nextAfter(order.current.filter((id) => id === reading.id || ids.includes(id)), reading.id);
    const row = next ? view?.rows.find((one) => one.id === next) : undefined;
    if (row) readInboxRow(row);
    readInboxLine(row ? row.id : null);
  }, [reading, ids, view]);

  const step = (by: -1 | 1) => {
    const row = rows[at + by];
    if (row) open(row);
  };
  const count = waitingCount(view);
  const today = localDay(now);
  const body = (
    <>
      <div className="flex h-[50px] shrink-0 items-start gap-2.5 px-[13px] pt-[13px]">
        {reading ? (
          <>
            <button type="button" onClick={() => readInboxLine(null)} aria-label={t("inbox.action.back")} title={t("inbox.action.back")}
              className="flex h-[34px] min-w-0 shrink-0 cursor-pointer items-center gap-0.5 rounded-full bg-composer pe-3 ps-2 text-[13px] font-semibold text-ink ring-1 ring-inset ring-ink/[0.07] transition-colors hover:bg-raised-hover">
              <ChevronLeft size={16} aria-hidden="true" className="rtl:rotate-180" />{t("inbox.panel.title")}
            </button>
            <span className="flex h-[34px] min-w-0 flex-1 items-center justify-end gap-0.5">
              {at >= 0 && <span data-inbox-position className="pe-1 text-[12px] tabular-nums text-ink-tertiary">{t("inbox.position", { index: at + 1, count: rows.length })}</span>}
              <button type="button" onClick={() => step(-1)} disabled={at <= 0} aria-label={t("inbox.action.previous")} title={t("inbox.action.previous")} className={NAV_BUTTON}>
                <ChevronUp size={16} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => step(1)} disabled={at < 0 || at >= rows.length - 1} aria-label={t("inbox.action.next")} title={t("inbox.action.next")} className={NAV_BUTTON}>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </span>
          </>
        ) : (
          <>
            <div data-inbox-tab-chip className="flex h-[34px] min-w-0 flex-1 items-center gap-2 ps-1 text-[14px]">
              <Inbox size={16} aria-hidden="true" className="shrink-0 text-ink-secondary" />
              <span className="min-w-0 truncate font-semibold text-ink">{t("inbox.panel.title")}</span>
              {count > 0 && <span data-inbox-tab-count className="shrink-0 font-medium tabular-nums text-ink-tertiary">{count}</span>}
            </div>
            {view?.rows.some((row) => row.unread) && (
              <button type="button" data-inbox-mark-all onClick={markAllInboxRead} disabled={markingAll}
                className="mt-[9px] shrink-0 cursor-pointer whitespace-nowrap text-[12px] text-accent-text hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:no-underline">
                {t("inbox.markAllRead")}
              </button>
            )}
            {!phone && (
              <button type="button" onClick={() => widenInbox(!panel.wide)} aria-pressed={Boolean(panel.wide)} aria-label={t(panel.wide ? "inbox.action.narrow" : "inbox.action.widen")}
                title={t(panel.wide ? "inbox.action.narrow" : "inbox.action.widen")} className={cn(roundButtonCls, "cursor-pointer")}>
                {panel.wide ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
              </button>
            )}
          </>
        )}
        <button type="button" onClick={closeInbox} aria-label={t("inbox.action.closePanel")} title={t("inbox.action.closePanel")} className={cn(roundButtonCls, "cursor-pointer")}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {reading && view ? (
          <InboxReading view={view} row={reading} now={now} onMute={(automation) => void mute(automation)} />
        ) : (
          <div ref={listRef} onScroll={(event) => { listTop.current = event.currentTarget.scrollTop; }} className="min-h-0 flex-1 overflow-y-auto">
            {listedRows(view).length > 0 && <label className="mx-4 mb-2 mt-1.5 flex h-9 items-center gap-2 rounded-[10px] bg-composer px-3 ring-1 ring-inset ring-ink/[0.09] focus-within:ring-ink/30">
              <Search size={14} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("inbox.search")} aria-label={t("inbox.search")}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-tertiary [&::-webkit-search-cancel-button]:hidden" />
            </label>}
            <div role="list" data-inbox-list aria-label={t("inbox.panel.title")} className="px-2 pb-2">
              {rows.length === 0
                ? query.trim() && listedRows(view).length
                  ? <p className="px-2 py-8 text-center text-[13px] text-ink-secondary">{t("inbox.noMatch")}</p>
                  : (
                    <div data-inbox-empty className="mx-auto flex max-w-[16rem] flex-col items-center px-4 py-10 text-center">
                      <Inbox size={22} strokeWidth={1.5} aria-hidden="true" className="text-ink-tertiary" />
                      <p className="mt-3 text-[14px] font-medium text-ink">{t("inbox.empty")}</p>
                      <p className="mt-1 text-[13px] leading-[18px] text-ink-tertiary">{t("inbox.emptyHint")}</p>
                    </div>
                  )
                : rows.map((row, index) => {
                  const day = localDay(row.at);
                  const newDay = index === 0 || localDay(rows[index - 1]!.at) !== day;
                  return (
                    <Fragment key={row.id}>
                      {newDay && <div data-inbox-day className="px-2 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.02em] text-ink-tertiary">{dayLabel(row.at, today)}</div>}
                      <InboxRowItem row={row} now={now} onOpen={open} onAction={run} lastRead={row.id === lastRead.current} />
                    </Fragment>
                  );
                })}
            </div>
            {!query.trim() && <InboxActive view={view} />}
          </div>
        )}
        {toast && (
          <div role="status" data-inbox-toast className="absolute inset-x-3 bottom-3 flex items-center gap-2.5 rounded-xl bg-raised-hover px-3 py-2.5 text-[13px] text-ink shadow-[0_8px_24px_rgb(0_0_0/0.45)]">
            <BellOff size={15} aria-hidden="true" className="shrink-0 text-ink-secondary" />
            <span className="min-w-0 flex-1 truncate">{"failed" in toast ? t("inbox.muteFailed") : t("inbox.muted", { name: toast.name })}</span>
            {!("failed" in toast) && (
              <button type="button" onClick={() => unmute(toast.id)} className="shrink-0 cursor-pointer rounded-md px-1.5 py-1 font-semibold text-accent-text hover:bg-ink/[0.07]">{t("common.undo")}</button>
            )}
          </div>
        )}
      </div>
    </>
  );
  if (phone) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onMouseDown={(event) => { if (event.target === event.currentTarget) closeInbox(); }}>
        <section role="dialog" aria-modal="true" aria-label={t("inbox.panel.title")} data-inbox-panel="sheet" onKeyDown={onKeyDown}
          className="animate-pop-in motion-reduce:animate-none flex max-h-[85dvh] min-h-[50dvh] flex-col overflow-hidden rounded-t-2xl border-t border-hairline/50 bg-panel pb-[env(safe-area-inset-bottom)]">
          {body}
        </section>
      </div>,
      document.body,
    );
  }
  return (
    <aside aria-label={t("inbox.panel.title")} data-inbox-panel="side" data-look="inbox" data-wide={panel.wide ? "" : undefined} onKeyDown={onKeyDown}
      className={cn("animate-panel-in motion-reduce:animate-none flex h-full max-w-full shrink-0 flex-col max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30",
        simple ? "border-l-[0.5px] border-ink/[0.06] bg-app" : "border-l border-hairline/40 bg-panel",
        panel.wide ? "w-[min(640px,60vw)]" : simple ? "w-[320px]" : "w-[380px]")}>
      {body}
    </aside>
  );
}
