import { Clock, Hourglass, Play, Plug, Webhook, Zap, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useShowThreads } from "@/lib/thread-preferences";
import { formatTime, openThread, useStore, type Bot, type Message } from "@/state/store";
import { liveCardKind } from "../../shared/live-approval";
import type { AutomationLine } from "../../shared/routine-run";
import { hasRoutineExecutionTask } from "./RoutineRunCard";

const TRIGGER_ICON: Partial<Record<AutomationLine["trigger"], LucideIcon>> = {
  schedule: Clock, webhook: Webhook, app: Plug, wait: Hourglass, manual: Play,
};

export type AutomationTone = "failed" | "asking" | null;

/** Whether an automation's post failed or still waits on the person: its first line says so and its edge is coloured. */
export function automationTone(message: Message, line: AutomationLine, own: Pick<Bot, "messages"> | undefined): AutomationTone {
  if (line.failed) return "failed";
  const asking = line.needsYou === true && (message.card ? liveCardKind(message.card) !== null : line.copyOf !== undefined ||
    !own?.messages.some((later) => later.role === "user" && later.at > message.at));
  return asking ? "asking" : null;
}

export const AUTOMATION_EDGE: Record<NonNullable<AutomationTone>, string> = {
  failed: "shadow-[inset_3px_0_0_var(--color-danger)]",
  asking: "shadow-[inset_3px_0_0_var(--color-warning)]",
};

/** An automation post's first line: what started the run, its name and time, and how it ended. The whole line opens the run. */
export function AutomationHead({ message, line, botId, tone, className }: {
  message: Message; line: AutomationLine; botId: string; tone: AutomationTone; className?: string;
}) {
  const { state, dispatch } = useStore();
  const showThreads = useShowThreads();
  const canOpen = state.bots.some((bot) => bot.threadId === line.executionThreadId || hasRoutineExecutionTask(bot.tasks, line.executionThreadId));
  const Icon = TRIGGER_ICON[line.trigger] ?? Zap;
  const color = line.partial || tone === "asking" ? "text-warning" : tone === "failed" ? "text-danger" : null;
  const status = tone && t(line.partial ? "chat.automation.partial" : tone === "failed" ? "chat.automation.failed" : "chat.automation.needsYou");
  const content = (
    <>
      <Icon aria-hidden="true" size={12} className={cn("shrink-0", color ?? (line.quiet ? "text-ink-tertiary" : "text-accent"))} />
      <span className="truncate font-semibold text-ink-secondary">{line.name}</span>
      <time className="shrink-0" dateTime={new Date(line.scheduledFor).toISOString()}>· {formatTime(line.scheduledFor || message.at)}</time>
      {status && <span className={cn("shrink-0", color)}>· {status}</span>}
    </>
  );
  const shape = cn("-mx-1.5 flex w-fit max-w-[calc(100%+12px)] min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px] leading-4 text-ink-tertiary", className);
  if (!canOpen) return <div data-automation-head={line.runId} className={shape}>{content}</div>;
  return (
    <button
      type="button"
      data-automation-head={line.runId}
      title={t("chat.automation.openRunFor", { name: line.name })}
      onClick={() => openThread(dispatch, { botId, threadId: line.executionThreadId }, state, showThreads)}
      className={cn(shape, "cursor-pointer text-left transition-colors hover:bg-ink/[0.06] hover:text-ink-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent")}
    >
      {content}
    </button>
  );
}
