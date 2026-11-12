import { ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import {
  sidebarAttentionLabel,
  type SidebarSectionAttention,
} from "@/lib/sidebar-attention";
import type { SectionNaming } from "./SidebarBotDrag";

const pressOf = new WeakMap<HTMLButtonElement, { x: number; y: number; moved: boolean }>();
const draggedOf = new WeakMap<HTMLButtonElement, boolean>();
const pendingOf = new WeakMap<HTMLButtonElement, ReturnType<typeof setTimeout>>();

export function SidebarSectionHeader({
  name,
  collapsed,
  attention,
  alert,
  onToggle,
  reorderable: canReorder,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onDelete,
  onContextMenu,
  line = false,
  onMenu,
  reserveMenu = false,
  menuOpen = false,
  count,
  naming,
  dropInto = false,
}: {
  name: string;
  collapsed: boolean;
  attention?: SidebarSectionAttention;
  alert?: boolean;
  onToggle?: () => void;
  reorderable: boolean;
  dragging: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  onMove?: (direction: -1 | 1) => void;
  onDelete?: () => void;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  line?: boolean;
  onMenu?: (button: HTMLButtonElement) => void;
  /** Keep the ⋯ button's space when this line has none, so counts line up with lines that do (Simple). */
  reserveMenu?: boolean;
  menuOpen?: boolean;
  /** How many rows the section holds. A closed Simple section shows it in the ⋯ column. */
  count?: number;
  /** A name field in place of the name, for a department being made or renamed. */
  naming?: SectionNaming;
  /** A dragged bot would go into this department. */
  dropInto?: boolean;
}) {
  const reorderable = canReorder && !naming;
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const rememberPress = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    draggedOf.delete(event.currentTarget);
    pressOf.set(event.currentTarget, { x: event.clientX, y: event.clientY, moved: false });
  };
  const trackPress = (event: PointerEvent<HTMLButtonElement>) => {
    const from = pressOf.get(event.currentTarget);
    if (!from) return;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > 4) from.moved = true;
  };
  const toggleIfStill = (event: PointerEvent<HTMLButtonElement>) => {
    const from = pressOf.get(event.currentTarget);
    pressOf.delete(event.currentTarget);
    if (!from || !onToggle) return;
    if (from.moved) {
      draggedOf.set(event.currentTarget, true);
      pressOf.set(event.currentTarget, from);
      return;
    }
    const waiting = pendingOf.get(event.currentTarget);
    if (waiting) clearTimeout(waiting);
    const button = event.currentTarget;
    pendingOf.set(button, setTimeout(() => {
      pendingOf.delete(button);
      onToggle();
    }, 0));
  };
  const toggleFromClick = (event?: MouseEvent<HTMLButtonElement>) => {
    const button = event?.currentTarget;
    if (button && draggedOf.get(button)) {
      draggedOf.delete(button);
      return;
    }
    const waiting = button ? pendingOf.get(button) : undefined;
    if (button && waiting) {
      clearTimeout(waiting);
      pendingOf.delete(button);
      onToggle?.();
      return;
    }
    if (!button || !pressOf.has(button)) onToggle?.();
  };
  const startSectionDrag = (event: DragEvent<HTMLButtonElement>) => {
    const from = event.currentTarget ? pressOf.get(event.currentTarget) : undefined;
    if (!from?.moved) {
      event.preventDefault();
      return;
    }
    onDragStart?.(event);
  };
  const attentionLabel = attention ? sidebarAttentionLabel(attention) : "";
  const onHeaderKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!reorderable || !event.altKey) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onMove?.(-1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onMove?.(1);
    }
  };
  const toggleTitle = reorderable
    ? collapsed
      ? t("sidebar.section.expandReorder", { name })
      : t("sidebar.section.collapseReorder", { name })
    : collapsed
      ? t("sidebar.section.expand", { name })
      : t("sidebar.section.collapse", { name });

  const dropMark = dropInto ? "bg-accent/10 outline outline-2 -outline-offset-2 outline-accent/70" : undefined;

  if (line) {
    const countSlot = (
      <span aria-hidden="true" className="flex w-7 shrink-0 items-center justify-center">
        {collapsed && count !== undefined && (
          <span className={cn("text-[12px] tabular-nums leading-4 text-ink-secondary", onMenu && "transition-opacity group-hover/section:opacity-0 group-focus-within/section:opacity-0 touch:opacity-0")}>{count}</span>
        )}
      </span>
    );
    return (
      <div
        data-section={name}
        data-sidebar-section-line=""
        data-section-drop={dropInto ? "" : undefined}
        tabIndex={onContextMenu ? -1 : undefined}
        onContextMenu={naming ? undefined : onContextMenu}
        className={cn("group/section relative flex h-[30px] items-stretch rounded-[6px] hover:bg-raised/50", dragging && "opacity-40", naming && "px-2 py-0.5", dropMark)}
      >
        {naming ? <SectionNameField {...naming} /> : onToggle ? (
          <button
            type="button"
            draggable={reorderable || undefined}
            onDragStart={reorderable ? startSectionDrag : undefined}
            onDragEnd={reorderable ? onDragEnd : undefined}
            onPointerDown={rememberPress}
            onPointerMove={trackPress}
            onPointerUp={toggleIfStill}
            onClick={toggleFromClick}
            onKeyDown={onHeaderKeyDown}
            aria-expanded={!collapsed}
            aria-keyshortcuts={reorderable ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
            title={toggleTitle}
            className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Chevron size={14} className="shrink-0 text-ink-secondary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[12px] leading-4 text-ink-secondary">{name}</span>
            {collapsed && <SectionAttention attention={attention} label={attentionLabel} alert={alert} />}
            {(Boolean(onMenu) || reserveMenu || count !== undefined) && countSlot}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2">
            <span className="min-w-0 flex-1 truncate text-[12px] leading-4 text-ink-secondary">{name}</span>
            {attentionLabel && <span className="sr-only">{attentionLabel}</span>}
            {(Boolean(onMenu) || reserveMenu || count !== undefined) && countSlot}
          </div>
        )}
        {onMenu && !naming && (
          <button
            type="button"
            aria-label={t("team.actions", { name })}
            title={t("team.actions", { name })}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(event) => onMenu(event.currentTarget)}
            className="pointer-events-none absolute right-2 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-[6px] text-ink-tertiary opacity-0 transition-opacity hover:bg-raised hover:text-ink focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus group-hover/section:pointer-events-auto group-hover/section:opacity-100 group-focus-within/section:pointer-events-auto group-focus-within/section:opacity-100 aria-expanded:pointer-events-auto aria-expanded:bg-raised aria-expanded:text-ink aria-expanded:opacity-100 touch:pointer-events-auto touch:opacity-100"
          >
            <MoreHorizontal size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1 rounded-md px-2 pb-1", dropMark)} data-section={name} data-section-drop={dropInto ? "" : undefined} tabIndex={onContextMenu ? -1 : undefined} onContextMenu={naming ? undefined : onContextMenu}>
      {naming ? <SectionNameField {...naming} /> : onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          onKeyDown={onHeaderKeyDown}
          aria-expanded={!collapsed}
          aria-keyshortcuts={reorderable ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
          title={toggleTitle}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-raised/50"
        >
          <span className="truncate text-[12px] font-semibold text-ink-secondary">
            {name}
          </span>
          <Chevron size={13} className="shrink-0 text-ink-secondary" aria-hidden="true" />
          <SectionAttention attention={attention} label={attentionLabel} alert={alert} />
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-0.5">
          <span className="truncate text-[12px] font-semibold text-ink-secondary">
            {name}
          </span>
          {attentionLabel && <span className="sr-only">{attentionLabel}</span>}
        </div>
      )}
      {onDelete && !naming && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t("sidebar.section.deleteAria", { name })}
          title={t("sidebar.section.deleteAria", { name })}
          className="flex size-6 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      )}
      {reorderable && (
        <span
          aria-hidden="true"
          draggable
          title={t("sidebar.section.dragToReorder")}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className={cn(
            "flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-ink-secondary hover:bg-raised hover:text-ink",
            dragging && "opacity-40",
          )}
        >
          <GripVertical size={13} />
        </span>
      )}
    </div>
  );
}

function SectionNameField({ value, label, onCommit, onCancel }: SectionNaming) {
  const [draft, setDraft] = useState(value);
  const field = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  // A menu that just closed hands focus back to its opener after this field mounts.
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const settle = (save: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (save) onCommit(draft);
    else onCancel();
  };
  return (
    <input
      ref={field}
      data-section-name-field=""
      value={draft}
      maxLength={60}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => settle(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          settle(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          settle(false);
        }
      }}
      className="h-6 min-w-0 flex-1 rounded-md bg-ink/[0.05] px-1.5 text-[13px] leading-[18px] text-ink outline-none ring-1 ring-accent/60"
    />
  );
}

function SectionAttention({ attention, label, alert }: { attention?: SidebarSectionAttention; label: string; alert?: boolean }) {
  return (
    <>
      {attention && attention.waiting > 0 && (
        <span
          aria-hidden="true"
          className="min-w-4 rounded-full bg-warning/15 px-1 text-center text-[9px] font-semibold leading-4 text-warning"
        >
          {attention.waiting}
        </span>
      )}
      {attention && attention.unread > 0 && (
        <span
          aria-hidden="true"
          className="min-w-4 rounded-full bg-accent/15 px-1 text-center text-[9px] font-semibold leading-4 text-accent"
        >
          {attention.unread}
        </span>
      )}
      {attention && attention.working > 0 && (
        <span
          aria-hidden="true"
          className="flex size-4 items-center justify-center"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-success" />
        </span>
      )}
      {label && <span className="sr-only">{label}</span>}
      {alert && (
        <>
          <span data-testid="section-alert" aria-hidden="true" className="size-2 shrink-0 rounded-full bg-danger" />
          <span className="sr-only">{t("computer.routines.needsYou")}</span>
        </>
      )}
    </>
  );
}
