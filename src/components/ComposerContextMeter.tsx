import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { CacheKeepWarmStatus } from "../../shared/wire";
import { cn } from "@/lib/cn";
import { threadContextWarning } from "@/lib/context-warning";
import { contextMeterReading, contextTokenRows, type ContextMeterReading } from "@/lib/context-meter";
import { t } from "@/lib/i18n";
import { useAdvancedMode } from "@/lib/interface-mode";
import { formatTokens } from "@/lib/usage";
import { usePopoverDismiss } from "@/hooks/use-popover-dismiss";
import { visibleMessages, type Bot, type TaskUsage } from "@/state/store";
import { useCompact } from "./ContextWarning";
import { useMenuMotion } from "./MenuMotion";

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 150;
const EDGE = 8;
const GAP = 14;
const RADIUS = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Ring({ reading }: { reading: ContextMeterReading }) {
  if (reading.percent === undefined) {
    return (
      <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
        <circle cx="10" cy="10" r={RADIUS} fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.01 4" className="stroke-ink/40" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden="true">
      <circle cx="10" cy="10" r={RADIUS} fill="none" strokeWidth="2.25" className="stroke-ink/[0.12]" />
      <circle
        cx="10" cy="10" r={RADIUS} fill="none" strokeWidth="2.25" strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - reading.fill / 100)}
        className={cn(
          "transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none",
          reading.danger ? "stroke-danger" : "stroke-ink-secondary",
        )}
      />
    </svg>
  );
}

function CacheState({ status }: { status: CacheKeepWarmStatus }) {
  const warm = status.state === "warm";
  const next = warm && status.nextPingAt !== undefined
    ? t("chat.keepWarm.next", { time: new Date(status.nextPingAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) })
    : null;
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="text-ink-secondary">{t("composer.context.cache")}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-ink" title={warm ? undefined : status.stopped}>
        <span className={cn("size-1.5 shrink-0 rounded-full", warm ? "bg-success" : "bg-ink-tertiary")} aria-hidden="true" />
        <span className="truncate tabular-nums">
          {warm ? t("composer.context.cacheWarm") : t("composer.context.cacheStopped")}
          {next && ` · ${next}`}
        </span>
      </span>
    </div>
  );
}

function TokenTable({ usage }: { usage: TaskUsage }) {
  const rows = contextTokenRows(usage);
  const hasLast = rows.some((row) => row.last !== undefined);
  return (
    <table className="w-full border-collapse text-[12px] tabular-nums">
      <thead>
        <tr className="text-[11px] text-ink-tertiary">
          <th scope="col" className="pb-1.5 text-start font-normal"><span className="sr-only">{t("composer.context.title")}</span></th>
          <th scope="col" className="w-16 pb-1.5 text-end font-medium">{t("composer.context.total")}</th>
          {hasLast && <th scope="col" className="w-24 pb-1.5 text-end font-medium">{t("composer.context.lastMessage")}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th scope="row" className="py-[3px] text-start font-normal text-ink-secondary">{t(`composer.context.${row.key}`)}</th>
            <td className="py-[3px] text-end text-ink">{formatTokens(row.total)}</td>
            {hasLast && <td className="py-[3px] text-end text-ink">{row.last === undefined ? "–" : formatTokens(row.last)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ContextCard({ bot, usage, reading, keepWarm, advanced }: {
  bot: Bot;
  usage: TaskUsage;
  reading: ContextMeterReading;
  keepWarm?: CacheKeepWarmStatus;
  advanced: boolean;
}) {
  const { pending, run } = useCompact();
  const canCompact = threadContextWarning(usage, visibleMessages(bot)) !== null;
  const busy = Boolean(bot.busy);
  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] font-semibold text-ink">{t("composer.context.title")}</span>
        <span className="text-[12px] tabular-nums text-ink-secondary">
          {reading.percent !== undefined && reading.window
            ? <><span className={cn("font-semibold", reading.danger ? "text-danger" : "text-ink")}>{reading.percent}%</span>{" · "}{t("composer.context.ofWindow", { tokens: formatTokens(reading.tokens), window: formatTokens(reading.window) })}</>
            : t("composer.context.tokens", { tokens: formatTokens(reading.tokens) })}
        </span>
      </div>
      {reading.percent !== undefined && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-ink/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={reading.fill}>
          <div
            className={cn("h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none", reading.danger ? "bg-danger" : "bg-ink-secondary")}
            style={{ width: `${reading.fill}%` }}
          />
        </div>
      )}
      {advanced && (
        <>
          <div className="-mx-3.5 my-3 h-px bg-ink/[0.06]" />
          <TokenTable usage={usage} />
          {keepWarm && <><div className="-mx-3.5 my-3 h-px bg-ink/[0.06]" /><CacheState status={keepWarm} /></>}
        </>
      )}
      {canCompact && (
        <button
          type="button"
          disabled={busy || pending}
          title={busy ? t("contextWarning.busy") : undefined}
          onClick={() => run(`/api/bots/${bot.id}/compact`, { threadId: bot.threadId })}
          className="mt-3 flex h-[30px] w-full cursor-pointer items-center justify-center rounded-[9px] bg-ink/[0.08] text-[13px] font-medium text-ink hover:bg-ink/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? t("contextWarning.compacting") : t("contextWarning.compactNow")}
        </button>
      )}
    </>
  );
}

export function ComposerContextMeter({ bot, compact }: { bot: Bot; compact: boolean }) {
  const advanced = useAdvancedMode();
  const task = bot.tasks?.find((entry) => entry.threadId === bot.threadId);
  const usage = task?.usage;
  const reading = contextMeterReading(usage);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardId = useId();
  const motion = useMenuMotion(open && reading !== null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);
  const later = (next: boolean, delay: number) => {
    clearTimer();
    timer.current = setTimeout(() => setOpen(next), delay);
  };
  const close = () => {
    clearTimer();
    setPinned(false);
    setOpen(false);
  };
  const enter = (event: React.PointerEvent) => { if (event.pointerType !== "touch" && !pinned) later(true, OPEN_DELAY_MS); };
  const leave = (event: React.PointerEvent) => { if (event.pointerType !== "touch" && !pinned) later(false, CLOSE_DELAY_MS); };

  const inside = useRef({ contains: (target: unknown) => [triggerRef.current, cardRef.current].some((node) => node?.contains(target as Node)) });
  usePopoverDismiss(open, inside, close);

  useLayoutEffect(() => {
    if (!motion.shown) return;
    const place = () => {
      const trigger = triggerRef.current, card = cardRef.current;
      if (!trigger || !card) return;
      const box = trigger.getBoundingClientRect();
      const left = Math.min(Math.max(box.right - card.offsetWidth, EDGE), window.innerWidth - card.offsetWidth - EDGE);
      const above = box.top - GAP - card.offsetHeight;
      setPosition({ left, top: above >= EDGE ? above : box.bottom + GAP });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [motion.shown, advanced]);

  if (!reading || !usage) return null;
  const label = t("chat.usage.contextShort", { value: reading.percent === undefined ? formatTokens(reading.tokens) : `${reading.percent}%` });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-composer-context
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onClick={() => {
          clearTimer();
          if (open && pinned) close();
          else { setPinned(true); setOpen(true); }
        }}
        className={cn(
          "relative flex shrink-0 cursor-pointer items-center justify-center rounded-full animate-[slot-fade-in_200ms_ease-out] before:absolute before:-inset-1.5 before:content-[''] hover:bg-ink/[0.06]",
          compact ? "size-7" : "size-8",
          open && "bg-ink/[0.06]",
        )}
      >
        <Ring reading={reading} />
      </button>
      {motion.shown && createPortal(
        <div
          ref={cardRef}
          id={cardId}
          role="dialog"
          aria-label={t("composer.context.title")}
          data-composer-context-card
          {...motion.exitProps}
          onPointerEnter={enter}
          onPointerLeave={leave}
          style={{ position: "fixed", left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? undefined : "hidden" }}
          className={cn(
            "popover-surface z-[60] rounded-[var(--radius-menu)] border border-hairline/50 bg-menu px-3.5 py-3 shadow-lg",
            advanced ? "w-[300px]" : "w-[260px]",
            motion.className,
          )}
        >
          <ContextCard bot={bot} usage={usage} reading={reading} keepWarm={task?.cacheKeepWarm} advanced={advanced} />
        </div>,
        document.body,
      )}
    </>
  );
}
