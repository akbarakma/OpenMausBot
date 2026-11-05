import { Calendar, Sparkles } from "lucide-react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { Bot } from "@/state/store";
import { useChatMoreItems } from "../ChatMoreMenu";
import { ModelPicker } from "../ModelPicker";
import type { SidebarMenuItem } from "../SidebarPopoverMenu";
import type { useBotSettingsDerived } from "../bot-settings/useBotSettingsDerived";
import { BotConversations } from "./Conversations";
import type { SimplePageId } from "./page-registry";
import { Card, NavRow, RowIcon, rowCls } from "./rows";

type Derived = ReturnType<typeof useBotSettingsDerived>;

export const CONVERSATION_ITEMS = ["find", "usage", "activity"];

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

export function DetailsTab({ bot, derived, onOpen }: {
  bot: Bot;
  derived: Derived;
  onOpen: (page: SimplePageId) => void;
}) {
  const { items } = useChatMoreItems(bot);
  const routinesOn = derived.botRoutines.filter((routine) => routine.enabled).length;
  const conversationItems = CONVERSATION_ITEMS.flatMap((key) => items.filter((item) => item.key === key));

  return (
    <div data-panel-tabpanel="details">
      <Card anchor="model">
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
          icon={Calendar}
          title={t("botSettings.simple.routines")}
          value={routinesOn > 0 ? t("botPanel.routinesOn", { count: routinesOn }) : t("botPanel.none")}
          onClick={() => onOpen("routines")}
        />
      </Card>

      <BotConversations bot={bot} />

      {conversationItems.length > 0 && (
        <Card label={t("botPanel.section.conversation")} anchor="conversation">
          {conversationItems.map((item) => <ItemRow key={item.key} item={item} />)}
        </Card>
      )}
    </div>
  );
}
