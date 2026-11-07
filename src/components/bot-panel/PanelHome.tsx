import { FolderOpen, History, Sparkles, Zap } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { Bot } from "@/state/store";
import { useChatMoreItems } from "../ChatMoreMenu";
import { ModelPicker } from "../ModelPicker";
import type { SidebarMenuItem } from "../SidebarPopoverMenu";
import { useBotAutomations } from "./AutomationsPage";
import { BotConversations } from "./Conversations";
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
      aria-pressed={item.active || undefined}
      onClick={item.onSelect}
      className={cn(rowCls, "w-full text-left enabled:hover:bg-ink/[0.03] disabled:cursor-default disabled:opacity-45")}
    >
      <span className="flex shrink-0 text-ink-secondary [&_svg]:size-4 [&_svg]:stroke-[1.75]" aria-hidden="true">
        {item.icon}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-[14px] font-medium", item.active ? "text-accent-text" : "text-ink")}>{item.label}</span>
      {item.trailing && <span className="flex shrink-0 items-center">{item.trailing}</span>}
    </button>
  );
}

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

      <BotConversations bot={bot} />
    </div>
  );
}
