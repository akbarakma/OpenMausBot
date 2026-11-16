import { FolderOpen, Gauge, History, Sparkles, Zap } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { Bot } from "@/state/store";
import { useChatMoreItems } from "../ChatMoreMenu";
import { EffortRow, ModelPicker } from "../ModelPicker";
import type { SidebarMenuItem } from "../SidebarPopoverMenu";
import { useBotAutomations } from "./AutomationsPage";
import { ComputerCard } from "./ComputerTab";
import { PanelContextCard } from "./ContextCard";
import { chatFolder, KnowsCard, libraryItems } from "./LibraryTab";
import type { SimplePageId } from "./page-registry";
import { Card, NavRow, RowIcon, rowCls } from "./rows";

/** A ⋯ menu item drawn as a panel row: the same label, icon, value and handler. */
function ItemRow({ item }: { item: SidebarMenuItem }) {
  return (
    <button
      type="button"
      data-panel-item={item.key}
      disabled={item.disabled}
      title={item.title}
      aria-pressed={item.active || undefined}
      onClick={item.onSelect}
      className={cn(rowCls, "w-full text-left enabled:cursor-pointer enabled:hover:bg-ink/[0.03] disabled:cursor-not-allowed disabled:opacity-45")}
    >
      <span className="flex shrink-0 text-ink-secondary [&_svg]:size-4 [&_svg]:stroke-[1.75]" aria-hidden="true">
        {item.icon}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-[14px] font-medium", item.active ? "text-accent-text" : "text-ink")}>{item.label}</span>
      {item.trailing && <span className="flex shrink-0 items-center">{item.trailing}</span>}
    </button>
  );
}

// Upstream's select, stretched over the row so a click anywhere opens it, and drawn like the Model row's value.
const REASONING_ROW = cn(
  "relative [&_div:has(>select)]:absolute [&_div:has(>select)]:inset-0 [&_div:has(>select)]:max-w-none",
  "[&_select]:h-full [&_select]:rounded-none [&_select]:bg-transparent [&_select]:py-0 [&_select]:pr-[30px] [&_select]:text-ink-secondary [&_select]:[text-align-last:right] [&_select]:hover:bg-ink/[0.03]",
  "[&_div:has(>select)>svg]:right-[13px] [&_div:has(>select)>svg]:size-3 [&_div:has(>select)>svg]:text-ink-tertiary",
);

export function PanelHome({ bot, onOpen }: { bot: Bot; onOpen: (page: SimplePageId) => void }) {
  const { items } = useChatMoreItems(bot);
  const automationState = useBotAutomations(bot.id);
  const automationsOn = automationState.automations.filter((automation) => automation.enabled).length;
  const find = items.find((item) => item.key === "find");
  const { pages, apps, shared, unshared } = useMemo(() => libraryItems(bot), [bot]);
  const made = pages.length + apps.length + shared.length + unshared.length;

  return (
    <div data-panel-home="">
      <ComputerCard key={bot.id} bot={bot} onOpen={onOpen} />

      <Card label={t("botPanel.computer.setup")} anchor="model">
        <div data-panel-row="model">
          <ModelPicker
            bot={bot}
            contained
            row
            threadId={bot.threadId}
            label={<><RowIcon icon={Sparkles} /><span className="shrink-0 text-[14px] font-medium text-ink">{t("model.simple.model")}</span></>}
          />
        </div>
        <EffortRow
          bot={bot}
          threadId={bot.threadId}
          compact
          className={cn(rowCls, REASONING_ROW)}
          label={<span className="flex shrink-0 items-center gap-2.5"><RowIcon icon={Gauge} /><span className="text-[14px] font-medium text-ink">{t("model.simple.reasoning")}</span></span>}
        />
        <NavRow
          data-panel-page="routines"
          icon={Zap}
          title={t("automations.title")}
          value={automationsOn > 0 ? t("botPanel.routinesOn", { count: automationsOn }) : automationState.loading ? undefined : t("botPanel.none")}
          onClick={() => onOpen("routines")}
        />
      </Card>

      <KnowsCard bot={bot} onOpen={onOpen} onData={() => onOpen("data")} folder={chatFolder(bot)} dataLabel="computer.tab.data" />

      <Card label={t("botPanel.section.conversation")} anchor="conversation">
        <NavRow data-panel-page="files" icon={FolderOpen} title={t("computer.tab.files")} value={made > 0 ? made : t("botPanel.none")} onClick={() => onOpen("files")} />
        {find && <ItemRow item={find} />}
        <NavRow data-panel-page="activity" icon={History} title={t("activity.panel.title")} onClick={() => onOpen("activity")} />
      </Card>

      <PanelContextCard bot={bot} />

    </div>
  );
}
