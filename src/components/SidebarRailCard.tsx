import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useStore, visibleMessages, type Bot, type Group } from "@/state/store";
import { BotAvatar } from "./Avatar";
import { botFaceState } from "./bot-face";
import { groupPreview, lastLine } from "./sidebar-preview";
import { sidebarBotStatus } from "./SidebarBotActivity";
import { TITLE_CHIP } from "./SidebarRowMarkers";
import { useBotUnread } from "./unread-notice";

const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 100;
const GAP = 8;
const EDGE = 8;
const ROW = "[data-sidebar-bot-row],[data-sidebar-group-row]";

type Target = { kind: "bot" | "group"; id: string; centerY: number };

function targetOf(row: Element): Target {
  const box = row.getBoundingClientRect();
  const botId = row.getAttribute("data-sidebar-bot-row");
  return { kind: botId ? "bot" : "group", id: botId ?? row.getAttribute("data-sidebar-group-row")!, centerY: box.top + box.height / 2 };
}

/** The collapsed rail's hover card: who a tile is, what it is doing, and the newest line, beside the tile. */
export function SidebarRailCard({ railRef }: { railRef: RefObject<HTMLElement | null> }) {
  const [target, setTarget] = useState<Target | null>(null);
  const shown = useRef(false);
  shown.current = target !== null;

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = (run: () => void, delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    };
    const hide = () => {
      clearTimeout(timer);
      setTarget(null);
    };
    const over = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !(event.target instanceof Element)) return;
      const row = event.target.closest(ROW);
      if (!row || !rail.contains(row)) return;
      if (shown.current) {
        clearTimeout(timer);
        const next = targetOf(row);
        setTarget((current) => (current?.kind === next.kind && current.id === next.id ? current : next));
      } else later(() => setTarget(targetOf(row)), OPEN_DELAY_MS);
    };
    const out = (event: PointerEvent) => {
      const from = event.target instanceof Element ? event.target.closest(ROW) : null;
      const to = event.relatedTarget instanceof Element ? event.relatedTarget.closest(ROW) : null;
      if (from && from === to) return;
      later(() => setTarget(null), shown.current ? CLOSE_DELAY_MS : 0);
    };
    const focusIn = (event: FocusEvent) => {
      const row = event.target instanceof Element ? event.target.closest(ROW) : null;
      if (row && (event.target as Element).matches(":focus-visible")) setTarget(targetOf(row));
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    rail.addEventListener("pointerover", over);
    rail.addEventListener("pointerout", out);
    rail.addEventListener("pointerdown", hide);
    rail.addEventListener("focusin", focusIn);
    rail.addEventListener("focusout", hide);
    rail.addEventListener("scroll", hide, true);
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(timer);
      rail.removeEventListener("pointerover", over);
      rail.removeEventListener("pointerout", out);
      rail.removeEventListener("pointerdown", hide);
      rail.removeEventListener("focusin", focusIn);
      rail.removeEventListener("focusout", hide);
      rail.removeEventListener("scroll", hide, true);
      window.removeEventListener("keydown", key);
    };
  }, [railRef]);

  if (!target || typeof document === "undefined") return null;
  return createPortal(<RailCard target={target} left={(railRef.current?.getBoundingClientRect().right ?? 0) + GAP} />, document.body);
}

function RailCard({ target, left }: { target: Target; left: number }) {
  const { state } = useStore();
  const card = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  const bot = target.kind === "bot" ? state.bots.find((entry) => entry.id === target.id) : undefined;
  const group = target.kind === "group" ? state.groups.find((entry) => entry.id === target.id) : undefined;

  useLayoutEffect(() => {
    const height = card.current?.offsetHeight ?? 0;
    setTop(Math.min(Math.max(target.centerY - height / 2, EDGE), window.innerHeight - height - EDGE));
  }, [target, bot, group]);

  if (!bot && !group) return null;
  return (
    <div
      ref={card}
      role="tooltip"
      data-sidebar-rail-card={target.kind}
      style={{ position: "fixed", left, top: top ?? 0, visibility: top === null ? "hidden" : undefined }}
      className="popover-surface pointer-events-none z-[60] w-[260px] rounded-[var(--radius-menu)] border border-hairline/50 bg-menu p-3 shadow-lg"
    >
      {bot ? <BotCardBody bot={bot} /> : <GroupCardBody group={group!} />}
    </div>
  );
}

function BotCardBody({ bot }: { bot: Bot }) {
  const { state } = useStore();
  const visible = visibleMessages(bot);
  const { waiting, working, running, teammateWait, queued } = sidebarBotStatus(bot, state.pendingQueued);
  const { unread } = useBotUnread(bot);
  const title = bot.title.trim();
  const status = waiting ? { label: t("sidebar.preview.waiting"), tone: "bg-warning", text: "text-warning" }
    : working ? { label: t("chat.activity.working"), tone: "bg-success", text: "text-ink-secondary" }
      : teammateWait ? { label: t("sidebar.preview.waitingOnTeammate"), tone: "bg-accent", text: "text-ink-secondary" }
        : queued ? { label: t("task.queued"), tone: "bg-ink-secondary", text: "text-ink-secondary" }
          : unread ? { label: t("task.unread"), tone: "bg-accent", text: "text-ink-secondary" }
            : null;
  const preview = lastLine(bot, visible, state.instances, false);
  return (
    <>
      <div className="flex h-5 items-center gap-2">
        <BotAvatar bot={bot} size={20} state={botFaceState(bot, visible, running, false)} motion="none" motionKey={0} animated={false} />
        <span className={cn("shrink-0 truncate text-[14px] font-medium text-ink", title ? "max-w-[calc(100%-48px)]" : "max-w-[calc(100%-28px)]")}>{bot.name}</span>
        {title && <span className={TITLE_CHIP}>{title}</span>}
      </div>
      {status && (
        <div className={cn("mt-2 flex items-center gap-1.5 text-[12px]", status.text)}>
          <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", status.tone)} />
          {status.label}
        </div>
      )}
      <p dir="auto" className={cn("mt-1.5 line-clamp-2 text-[13px] leading-[18px]", preview ? "text-ink-secondary" : "text-ink-tertiary")}>
        {preview || t("sidebar.preview.noMessages")}
      </p>
    </>
  );
}

function GroupCardBody({ group }: { group: Group }) {
  const { state } = useStore();
  const members = group.memberIds.map((id) => state.bots.find((bot) => bot.id === id)).filter((bot): bot is Bot => Boolean(bot));
  return (
    <>
      <div className="flex h-5 items-center gap-2">
        {members.length > 0 && (
          <span className="flex shrink-0 items-center -space-x-2">
            {members.slice(0, 2).map((member) => <BotAvatar key={member.id} bot={member} size={20} state="happy" motion="none" motionKey={0} animated={false} />)}
          </span>
        )}
        <span className="min-w-0 truncate text-[14px] font-medium text-ink">{group.name}</span>
      </div>
      {group.unread && (
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-secondary">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" />
          {t("task.unread")}
        </div>
      )}
      <p dir="auto" className="mt-1.5 line-clamp-2 text-[13px] leading-[18px] text-ink-secondary">
        {groupPreview(group, state.bots, state.instances, false)}
      </p>
    </>
  );
}
