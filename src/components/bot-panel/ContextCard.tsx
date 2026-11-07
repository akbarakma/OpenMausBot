import { cn } from "@/lib/cn";
import { contextMeterReading } from "@/lib/context-meter";
import { t } from "@/lib/i18n";
import { formatTokens } from "@/lib/usage";
import { currentTaskBot, type Bot } from "@/state/store";
import { CompactButton, ContextBar } from "../ComposerContextMeter";
import { Card } from "./rows";

export function PanelContextCard({ bot }: { bot: Bot }) {
  const usage = bot.tasks?.find((task) => task.threadId === bot.threadId)?.usage;
  const reading = contextMeterReading(usage);
  if (!reading || !usage) return null;
  const known = reading.percent !== undefined;
  return (
    <Card label={t("composer.context.title")} anchor="context">
      <div data-panel-context="" className="px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-4">
          <span className={cn("text-[14px] font-semibold tabular-nums", reading.danger ? "text-danger" : "text-ink")}>
            {known ? `${reading.percent}%` : t("composer.context.tokens", { tokens: formatTokens(reading.tokens) })}
          </span>
          {known && reading.window && (
            <span className="text-[13px] tabular-nums text-ink-secondary">
              {t("composer.context.ofWindow", { tokens: formatTokens(reading.tokens), window: formatTokens(reading.window) })}
            </span>
          )}
        </div>
        {known && <ContextBar reading={reading} />}
        <CompactButton bot={currentTaskBot(bot)} usage={usage} />
      </div>
    </Card>
  );
}
