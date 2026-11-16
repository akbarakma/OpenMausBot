import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, ChevronRight } from "lucide-react";
import { api } from "@/state/api";
import { currentTaskBot, formatTime, openThread, useStore, type Bot } from "@/state/store";
import { closeExchange, openExchange, useShownExchange, type ExchangeLine, type OneChatRow } from "@/lib/bot-exchange";
import { useShowThreads } from "@/lib/thread-preferences";
import { cn } from "@/lib/cn";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import { localDay } from "@/lib/transcript-derivations";
import { MAUS_COLORS } from "@/lib/mascot";
import { t } from "@/lib/i18n";
import { BotAvatar } from "./Avatar";
import { ChatMarkdown } from "./ChatMarkdown";
import { ChatView } from "./ChatView";
import { DaySeparator } from "./DaySeparator";
import { GroupView } from "./GroupView";
import { SIMPLE_BOT_BUBBLE } from "./chat-bubble";

const nameColor = (bot: Bot) => (bot.color === "chrome" ? undefined : { color: MAUS_COLORS[bot.color] });

const LINE = "inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors hover:bg-ink/[0.06]";

export function OneChatLine({ row }: { row: OneChatRow }) {
  const { state, dispatch } = useStore();
  const showThreads = useShowThreads();
  if (row.kind === "sideJob") {
    if (!row.ended) return null;
    const stopped = !row.ok && row.name.startsWith(t("server.teammates.cancelled", { bot: `#${row.title}`, detail: "" }));
    const failed = !row.ok && !stopped;
    return (
      <div className="flex justify-center">
        <button type="button" data-side-job-line={row.threadId} title={row.ok ? undefined : row.name}
          onClick={() => openThread(dispatch, { botId: row.ownId, threadId: row.threadId }, state, showThreads)}
          className={cn(LINE, failed ? "text-danger" : "text-ink-secondary hover:text-ink")}>
          <span className="shrink-0">{t(failed ? "chat.sideJob.failed" : stopped ? "chat.sideJob.stopped" : "chat.sideJob.finished")}</span>
          <span aria-hidden="true">·</span>
          <span className={cn("truncate font-medium", !failed && "text-ink")}>{row.title}</span>
          <ChevronRight size={13} className="shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </div>
    );
  }
  const peer = state.bots.find((bot) => bot.id === row.peerId);
  if (!peer) return null;
  return (
    <div className="flex justify-center">
      <button type="button" data-exchange-line={row.peerId} onClick={() => openExchange(row.ownId, row.peerId)}
        aria-label={t("chat.exchange.open", { name: peer.name })} className={cn(LINE, "text-ink-secondary hover:text-ink")}>
        <span className="shrink-0">{t(row.sent ? "chat.exchange.messaged" : "chat.exchange.messageFrom")}</span>
        <BotAvatar bot={peer} state="happy" size={16} animated={false} />
        <span className="truncate font-medium text-ink">{peer.name}</span>
        <ChevronRight size={13} className="shrink-0 text-ink-tertiary" aria-hidden="true" />
      </button>
    </div>
  );
}

// Hidden work reuses upstream's fork panel state, so its live rows, read marks and loading stay upstream's.
export function WorkModal() {
  const { state, dispatch } = useStore();
  const pair = useShownExchange();
  const panel = state.forkPanel;
  useEffect(() => closeExchange, [state.selectedId, state.activeView]);
  if (!pair && !panel) return null;
  const close = () => { closeExchange(); dispatch({ type: "closeForkPanel" }); };
  return <WorkDialog pair={pair} onClose={close} />;
}

function WorkDialog({ pair, onClose }: { pair: { a: string; b: string } | null; onClose: () => void }) {
  const { state } = useStore();
  const dialog = useRef<HTMLDivElement>(null);
  useModalDialog(dialog, onClose);
  const panel = state.forkPanel;
  const a = pair && state.bots.find((bot) => bot.id === pair.a), b = pair && state.bots.find((bot) => bot.id === pair.b);
  const owner = panel && (panel.kind === "bot" ? state.bots : state.groups).find((candidate) => candidate.id === panel.ownerId);
  const task = panel && owner?.tasks?.find((candidate) => candidate.threadId === panel.threadId);
  const label = panel ? task?.title ?? t("chat.forkPanel") : t("chat.exchange.title", { a: a?.name ?? "", b: b?.name ?? "" });

  return createPortal(
    <div className="ui-scrim fixed inset-0 z-50 flex items-center justify-center p-4 motion-reduce:animate-none"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" tabIndex={-1} aria-label={label} data-work-modal=""
        className="ui-modal animate-pop-in flex h-[min(760px,calc(100vh-48px))] w-[min(600px,calc(100vw-32px))] flex-col overflow-hidden text-ink outline-none motion-reduce:animate-none">
        <header className="flex h-14 shrink-0 items-center justify-center px-5">
          {panel ? <h2 className="truncate text-[14px] font-medium">{label}</h2> : a && b && (
            <h2 className="flex min-w-0 items-center gap-2 text-[14px] font-medium" aria-label={label}>
              <BotAvatar bot={a} state="happy" size={22} animated={false} /><span className="truncate">{a.name}</span>
              <ArrowLeftRight size={14} className="shrink-0 text-ink-tertiary" aria-hidden="true" />
              <BotAvatar bot={b} state="happy" size={22} animated={false} /><span className="truncate">{b.name}</span>
            </h2>
          )}
        </header>
        <div className="ui-modal-divider" />
        <div className="min-h-0 flex-1 bg-app [&_[data-look=chat-header]]:hidden">
          {panel ? <HiddenWork /> : pair && <Transcript a={pair.a} b={pair.b} />}
        </div>
        <div className="ui-modal-divider" />
        <footer className="flex h-16 shrink-0 items-center justify-center">
          <button type="button" onClick={onClose} className="ui-button h-9 cursor-pointer px-5 text-[14px] font-medium">{t("common.close")}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function HiddenWork() {
  const { state, dispatch } = useStore();
  const panel = state.forkPanel!;
  const bot = panel.kind === "bot" ? state.bots.find((candidate) => candidate.id === panel.ownerId) : undefined;
  const group = panel.kind === "group" ? state.groups.find((candidate) => candidate.id === panel.ownerId) : undefined;
  const botTask = bot?.tasks?.find((candidate) => candidate.threadId === panel.threadId);
  const groupTask = group?.tasks?.find((candidate) => candidate.threadId === panel.threadId);
  if (panel.loading) return <p className="p-4 text-sm text-ink-secondary">{t("chat.loadingFork")}</p>;
  if (panel.loadFailed) return (
    <div className="flex items-center gap-3 p-4 text-sm text-ink-secondary">
      <span>{t("chat.forkUnavailable")}</span>
      <button type="button" className="cursor-pointer rounded px-2 py-1 text-ink hover:bg-raised"
        onClick={() => dispatch({ type: "openForkPanel", kind: panel.kind, ownerId: panel.ownerId, threadId: panel.threadId })}>{t("chat.retry")}</button>
    </div>
  );
  if (bot && botTask) return <ChatView key={panel.threadId} inForkPanel
    bot={{ ...currentTaskBot(bot, panel.threadId), messages: panel.messages, activeLeafId: panel.activeLeafId, hasMore: false }} />;
  if (group && groupTask) return <GroupView key={panel.threadId} inForkPanel group={{ ...group, threadId: panel.threadId, messages: panel.messages, hasMore: false,
    working: groupTask.working ?? false, busyBotId: groupTask.busyBotId ?? null, turnStartedAt: null, pinnedCwd: groupTask.pinnedCwd, pinnedMessageId: groupTask.pinnedMessageId }} />;
  return <p className="p-4 text-sm text-ink-secondary">{t("chat.forkUnavailable")}</p>;
}

function Transcript({ a, b }: { a: string; b: string }) {
  const { state } = useStore();
  const [lines, setLines] = useState<ExchangeLine[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const touched = Math.max(0, ...state.bots.filter((bot) => bot.id === a || bot.id === b)
    .flatMap((bot) => (bot.tasks ?? []).map((task) => task.updatedAt ?? 0)));

  useEffect(() => {
    let live = true;
    setFailed(false);
    api<{ lines: ExchangeLine[] }>(`/api/bots/${a}/exchange/${b}`)
      .then((body) => { if (live) setLines(body.lines); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [a, b, attempt, touched]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [lines]);

  if (failed && !lines) return (
    <div className="flex items-center justify-center gap-3 p-6 text-sm text-ink-secondary">
      <span>{t("chat.forkUnavailable")}</span>
      <button type="button" className="ui-button h-8 cursor-pointer px-3" onClick={() => setAttempt((n) => n + 1)}>{t("chat.retry")}</button>
    </div>
  );
  if (!lines) return <p className="p-6 text-center text-sm text-ink-secondary">{t("chat.loadingFork")}</p>;
  if (!lines.length) return <p className="p-6 text-center text-sm text-ink-secondary">{t("chat.exchange.empty")}</p>;
  const today = localDay(Date.now());
  return (
    <div ref={scroller} className="h-full overflow-y-auto px-5 pb-5" data-exchange-transcript="">
      {lines.map((line, index) => {
        const bot = state.bots.find((candidate) => candidate.id === line.botId);
        const newDay = index === 0 || localDay(lines[index - 1]!.at) !== localDay(line.at);
        return (
          <div key={line.id}>
            {newDay && <DaySeparator at={line.at} today={today} simple />}
            <div className="mt-3 flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0">{bot && <BotAvatar bot={bot} state="happy" size={26} animated={false} />}</span>
              <div className="flex min-w-0 max-w-[86%] flex-col items-start gap-1">
                <span className="px-1 text-[13px] font-semibold text-ink-secondary" style={bot ? nameColor(bot) : undefined}>{bot?.name}</span>
                {line.text ? <div className={SIMPLE_BOT_BUBBLE}><ChatMarkdown text={line.text} /></div>
                  : <div className="px-1 text-[13px] text-ink-secondary">{t(`chat.exchange.${line.status ?? "working"}`)}</div>}
                {line.id.endsWith(":reply") && <span className="px-1 text-[12px] text-ink-tertiary">{formatTime(line.at)}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
