import { Check, CornerUpLeft, ExternalLink, Split, X, type LucideIcon } from "lucide-react";
import type { InboxRow } from "../../../shared/inbox";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/clock-time";
import { t } from "@/lib/i18n";
import { localDay } from "@/lib/transcript-derivations";
import type { LocaleKey } from "@/locales";
import { InboxSender } from "../InboxLine";
import { threadUpdatedLabel } from "../SidebarThreadRow";
import { choicesLine, headlineOf } from "./inbox-answer";
import { placeOf, quickActions, senderLabel, subjectOf, textOf, type QuickAction } from "./inbox-view";

const ACTION_LOOK: Record<QuickAction, { Icon: LucideIcon; label: LocaleKey }> = {
  allow: { Icon: Check, label: "approval.action.allowOnce" },
  deny: { Icon: X, label: "approval.action.deny" },
  reply: { Icon: CornerUpLeft, label: "chat.reply" },
  close: { Icon: Check, label: "common.done" },
  done: { Icon: Check, label: "inbox.action.markDone" },
  open: { Icon: ExternalLink, label: "inbox.action.openInChat" },
};

const ROW_ACTION = "flex size-7 shrink-0 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-ink/[0.07] hover:text-ink active:bg-ink/[0.11] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus pointer-coarse:size-9";

/** Today's lines say how long ago; an older one sits under its day's header, so it says the time of day. */
function panelTime(at: number, now: number): string {
  if (localDay(at) === localDay(now)) return threadUpdatedLabel(at, now);
  return formatTime(at);
}

/** What a row says under its sender: an ask's headline and choices, or the line's words on up to two lines. */
function PanelBody({ row }: { row: InboxRow }) {
  const choices = choicesLine(row);
  if (row.kind !== "ask") return <span data-inbox-subject className="mt-0.5 line-clamp-2 text-[13px] leading-[18px]">{textOf(row).replace(/\s+/g, " ").trim()}</span>;
  return (
    <>
      <span data-inbox-subject className="mt-0.5 block truncate text-[13px] leading-[18px]">{headlineOf(row)}</span>
      {choices ? (
        <span data-inbox-choices className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-secondary">
          <Split size={12} aria-hidden="true" className="shrink-0 rotate-180 text-warning" />
          <span className="min-w-0 truncate">{choices}</span>
        </span>
      ) : null}
    </>
  );
}

export function InboxRowItem({ row, now, onOpen, onAction, inCard = false, lastRead = false }: {
  row: InboxRow;
  now: number;
  onOpen(row: InboxRow): void;
  onAction(row: InboxRow, action: QuickAction): void;
  /** On the inbox's card in the chat, which is wider than the panel and draws its own dividers. */
  inCard?: boolean;
  /** The line the person just came back from. */
  lastRead?: boolean;
}) {
  const actions = quickActions(row);
  const sender = senderLabel(row);
  if (!inCard) {
    const waits = row.tab === "needs-you";
    const doneable = actions.includes("done");
    const strong = row.unread || waits;
    return (
      <div data-inbox-row={row.id} data-tab={row.tab} data-unread={row.unread ? "" : undefined} data-last-read={lastRead ? "" : undefined}
        className={cn("group relative rounded-[10px] focus-within:bg-raised hover:bg-raised", lastRead && "bg-accent/10 ring-1 ring-inset ring-accent/35")}>
        <button type="button" onClick={() => onOpen(row)} title={[sender, row.automation?.name ?? placeOf(row), headlineOf(row)].filter(Boolean).join(" · ")}
          className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-[10px] px-2 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60">
          <span className="shrink-0" aria-hidden="true"><InboxSender from={row.from} size={32} /></span>
          <span className={cn("min-w-0 flex-1", strong ? "text-ink-secondary" : "text-ink-tertiary", doneable && "group-focus-within:pe-10 group-hover:pe-10")}>
            <span className="flex h-[18px] min-w-0 items-center gap-1.5">
              <span data-inbox-from className={cn("min-w-0 truncate text-[14px]", strong ? "font-semibold text-ink" : "font-medium text-ink-secondary")}>{sender}</span>
              {waits && <span data-inbox-place className="shrink-0 rounded-md bg-warning/15 px-1.5 py-px text-[11px] font-medium text-warning">{t("inbox.needsYou")}</span>}
              <span className="ms-auto flex shrink-0 items-center gap-1.5 ps-1 text-[11px] tabular-nums text-ink-tertiary">
                {panelTime(row.at, now)}
                {waits ? <span data-inbox-waits role="img" aria-label={t("inbox.waitsOnYou")} className="size-[7px] rounded-full bg-warning" />
                  : row.unread && <span data-inbox-unread-dot aria-hidden="true" className="size-[7px] rounded-full bg-accent" />}
              </span>
            </span>
            <PanelBody row={row} />
          </span>
        </button>
        {doneable && (
          <button type="button" data-inbox-action="done" aria-label={t("inbox.action.markDone")} title={t("inbox.action.markDone")} onClick={() => onAction(row, "done")}
            className="absolute right-2 top-1/2 hidden size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-ink-secondary ring-[1.5px] ring-inset ring-ink/25 transition-colors after:absolute after:-inset-1.5 hover:bg-ink/[0.1] hover:text-ink hover:ring-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus group-focus-within:flex group-hover:flex">
            <Check size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }
  const subject = subjectOf(row);
  return (
    <div data-inbox-row={row.id} data-tab={row.tab} data-unread={row.unread ? "" : undefined}
      className={cn("group relative flex min-w-0 items-center gap-2 pr-1.5 focus-within:bg-raised/70 hover:bg-raised/70", row.unread ? "bg-raised/45" : "bg-transparent")}>
      <button type="button" onClick={() => onOpen(row)} title={[sender, subject, placeOf(row)].filter(Boolean).join(" · ")}
        className={cn("flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2.5 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60",
          row.unread ? "font-semibold text-ink" : "font-normal text-ink-secondary")}>
        {row.tab === "needs-you" && <span data-inbox-waits className="size-1.5 shrink-0 rounded-full bg-warning" role="img" aria-label={t("inbox.waitsOnYou")} />}
        <span className="shrink-0" aria-hidden="true"><InboxSender from={row.from} size={20} /></span>
        <span className="w-[7.5rem] shrink-0 truncate">{row.from.name}</span>
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="max-w-[45%] shrink-0 truncate">{subject}</span>
          <span className="min-w-0 truncate font-normal text-ink-tertiary">{textOf(row)}</span>
        </span>
        <span className="shrink-0 text-[11px] font-normal tabular-nums text-ink-tertiary group-focus-within:invisible group-hover:invisible">{threadUpdatedLabel(row.at, now)}</span>
      </button>
      <span className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-raised group-focus-within:flex group-hover:flex">
        {actions.map((action) => {
          const { Icon, label } = ACTION_LOOK[action];
          return (
            <button key={action} type="button" data-inbox-action={action} aria-label={t(label)} title={t(label)} onClick={() => onAction(row, action)} className={ROW_ACTION}>
              <Icon size={14} aria-hidden="true" />
            </button>
          );
        })}
      </span>
    </div>
  );
}
