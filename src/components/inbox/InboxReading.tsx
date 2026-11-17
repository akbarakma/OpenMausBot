import { BellOff, Check, ExternalLink, UserRound, X } from "lucide-react";
import type { InboxRow, InboxView } from "../../../shared/inbox";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { ChatMarkdown } from "../ChatMarkdown";
import { InboxSender } from "../InboxLine";
import { threadUpdatedLabel } from "../SidebarThreadRow";
import { accessRequestWords } from "../bot-access/access-card";
import { InboxAnswer } from "./InboxAnswer";
import { answerKindOf, headlineOf, singleQuestion } from "./inbox-answer";
import { askOf, closeResponse, senderLabel, textOf } from "./inbox-view";
import { useAskContext } from "./use-ask-context";
import { useInboxActions } from "./use-inbox-actions";

function settledLabel(row: InboxRow): string {
  if (row.kind !== "ask") return t("common.done");
  const card = row.card;
  if (card?.stopped) return t("ask.settled.stopped");
  if (card?.expired) return t(card.tool ? "approval.status.expired" : "ask.settled.expired");
  if (card?.answered === "allow") return t("approval.status.allowed");
  if (card?.answered === "deny") return t("approval.status.denied");
  return card?.answered === "answer" && !card.dismissed ? t("question.status.answered") : t("question.status.closed");
}

/** What the line itself says, drawn after the bot's words before it: a question's question, news as it came. An approval,
 * a password or a sign-in says it on its own card. */
function ownWords(row: InboxRow): string | null {
  if (row.secret || row.signIn || row.connector) return null;
  if (row.kind !== "ask") return textOf(row);
  if (row.card?.tool) return null;
  const question = singleQuestion(row);
  return question ? accessRequestWords(row.card)?.question ?? question.question : row.card?.questionRequest ? null : row.card?.subtitle || row.text;
}

const BAR_BUTTON = "flex h-10 min-w-0 flex-1 cursor-pointer items-center justify-center gap-[7px] rounded-[10px] px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed";
const SECONDARY = cn(BAR_BUTTON, "bg-composer text-ink ring-1 ring-inset ring-ink/[0.1] hover:bg-raised-hover");

export function InboxReading({ view, row, now, onMute }: {
  view: InboxView;
  row: InboxRow;
  now: number;
  onMute(automation: { id: string; name: string }): void;
}) {
  const { answer, openInChat, run, askerOf } = useInboxActions(view);
  const asker = askerOf(row);
  const context = useAskContext(row);
  const kind = answerKindOf(row);
  const headline = headlineOf(row);
  const words = ownWords(row);
  const said = context.filter((message) => message.text?.trim() !== words?.trim());
  const opens = Boolean(row.origin || view.threadId);
  const closes = askOf(row) === "question";
  const mutes = row.kind === "result" && row.automation && view.mutedAutomations !== undefined ? row.automation : null;
  const answers = kind !== "none" || Boolean(row.answers?.length);
  return (
    <article data-inbox-reading={row.id} aria-label={`${senderLabel(row)} · ${headline}`} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-3.5">
        <section aria-label={senderLabel(row)}>
          <div className="flex items-center gap-3">
            <span className="shrink-0" aria-hidden="true"><InboxSender from={row.from} size={40} /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-ink">{senderLabel(row)}</div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-tertiary">
                {row.automation && <span data-inbox-automation className="min-w-0 truncate rounded-md bg-ink/[0.07] px-1.5 py-px text-[11px] font-medium text-ink-secondary">{row.automation.name}</span>}
                <span className="shrink-0 tabular-nums">{threadUpdatedLabel(row.at, now)}</span>
              </div>
              {row.via && <div className="truncate text-[12px] text-ink-tertiary">{t("inbox.via", { name: row.via.name })}</div>}
            </div>
          </div>
          <div data-inbox-words className="mt-3.5 space-y-2 text-[14px] leading-[22px] text-ink">
            {said.map((message) => <ChatMarkdown key={message.id} text={message.text!} />)}
            {words && <ChatMarkdown text={words} />}
          </div>
        </section>
        {row.answers?.map((given) => (
          <p key={given.at} className="rounded-xl bg-ink/[0.045] px-3 py-2 text-[13px] text-ink-secondary">
            <span className="block text-[11px] font-medium text-ink-tertiary">{t(given.by === "assistant" ? "inbox.assistantAnswered" : "inbox.youReplied")}</span>
            <span className="whitespace-pre-wrap break-words">{given.text}</span>
          </p>
        ))}
        {answers && (
          <section data-inbox-you aria-label={t("inbox.you")} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-ink/[0.08] text-ink-secondary"><UserRound size={13} /></span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="text-[13px] font-semibold text-ink">{t("inbox.you")}</div>
              <InboxAnswer kind={kind} view={view} row={row} asker={asker} />
            </div>
          </section>
        )}
      </div>
      {(opens || closes || row.tab !== "needs-you" || mutes) && (
        <div data-inbox-bar className="shrink-0 space-y-2 border-t border-ink/[0.07] px-4 pb-3.5 pt-3">
          <div className="flex gap-2">
            {opens && (
              <button type="button" data-inbox-action="open" onClick={() => openInChat(row)} className={SECONDARY}>
                <ExternalLink size={15} aria-hidden="true" className="shrink-0" /><span className="truncate">{t("inbox.action.openInChat")}</span>
              </button>
            )}
            {closes && (
              <button type="button" data-inbox-action="close" onClick={() => answer(row, closeResponse(row))} className={SECONDARY}>
                <X size={15} aria-hidden="true" className="shrink-0" /><span className="truncate">{t("inbox.action.closeQuestion")}</span>
              </button>
            )}
            {row.tab === "info" && (
              <button type="button" data-inbox-action="done" onClick={() => run(row, "done")} className={cn(BAR_BUTTON, "bg-accent text-accent-ink hover:bg-accent-border")}>
                <Check size={15} aria-hidden="true" className="shrink-0" /><span className="truncate">{t("inbox.action.markDone")}</span>
              </button>
            )}
            {row.tab === "done" && (
              <button type="button" data-inbox-settled disabled className={cn(BAR_BUTTON, "bg-ink/[0.05] text-ink-secondary")}>
                <Check size={15} aria-hidden="true" className="shrink-0" /><span className="truncate">{settledLabel(row)}</span>
              </button>
            )}
          </div>
          {mutes && (
            <button type="button" data-inbox-mute onClick={() => onMute(mutes)}
              className="flex h-[34px] w-full min-w-0 cursor-pointer items-center justify-center gap-[7px] rounded-lg px-2 text-[12px] text-ink-secondary transition-colors hover:bg-ink/[0.05] hover:text-ink">
              <BellOff size={14} aria-hidden="true" className="shrink-0" /><span className="truncate">{t("inbox.mute", { name: mutes.name })}</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
}
