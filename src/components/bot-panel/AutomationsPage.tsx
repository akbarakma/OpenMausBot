import { useMemo } from "react";
import { ArrowUpRight, Plus } from "lucide-react";

import { useAppTriggers } from "@/lib/app-triggers";
import { automationsFrom, automationStatus, orderAutomations, statusLine, type Automation, type AutomationKind } from "@/lib/automations";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { useStore } from "@/state/store";
import { useAllAutomationActions } from "../automations/app-actions";
import { StatusMark } from "../automations/parts";
import type { PageContext } from "./pages";
import { BotSwitch, Card, LinkRow, NoteRow, rowCls, RowText } from "./rows";

const GROUPS: readonly { kind: AutomationKind; title: LocaleKey; hint: LocaleKey }[] = [
  { kind: "schedule", title: "botSettings.simple.routines", hint: "automations.newBox.onSchedule" },
  { kind: "webhook", title: "botPanel.page.webhooks", hint: "automations.newBox.whenApp" },
  { kind: "app", title: "botPanel.automations.appEvents", hint: "automations.newBox.whenAppEvent" },
];

export function useBotAutomations(botId: string): { automations: Automation[]; loading: boolean } {
  const { state } = useStore();
  const appTriggers = useAppTriggers();
  const automations = useMemo(
    () => orderAutomations(automationsFrom({ routines: state.routines, webhooks: state.webhooks, appTriggers: appTriggers.triggers, runs: state.routineRuns })
      .filter((automation) => automation.botId === botId)),
    [state.routines, state.webhooks, appTriggers.triggers, state.routineRuns, botId],
  );
  const remoteClient = typeof window !== "undefined" && window.ogb?.remoteClient?.active === true;
  return { automations, loading: state.routinesLoadState === "loading" || (!remoteClient && !appTriggers.loaded) };
}

export function AutomationsPage({ bot }: PageContext) {
  const { state, dispatch } = useStore();
  const actions = useAllAutomationActions();
  const { automations, loading } = useBotAutomations(bot.id);

  return (
    <>
      {GROUPS.map(({ kind, title, hint }) => {
        const items = automations.filter((automation) => automation.kind === kind);
        if (items.length === 0) return null;
        return (
          <Card key={kind} anchor={`automations-${kind}`} label={<><span className="font-medium text-ink">{t(title)}</span> · {t(hint)}</>}>
            {items.map((automation) => {
              const status = automationStatus(automation);
              return (
                <div key={automation.id} className={rowCls}>
                  <button
                    type="button"
                    data-panel-open={automation.id}
                    onClick={() => dispatch({ type: "showRoutines", view: "list", routineId: automation.id })}
                    className="-my-[11px] -ml-3.5 flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-[11px] pl-3.5 text-left hover:opacity-80"
                  >
                    <StatusMark status={status} />
                    <RowText title={automation.name.trim() || t("automations.title")} hint={status.state === "needs-you" ? t("automations.needsYou", { reason: status.reason ?? "" }) : statusLine(automation)} />
                  </button>
                  {status.state !== "done" && (
                    <BotSwitch
                      color={bot.color}
                      checked={automation.enabled}
                      disabled={Boolean(actions.busy)}
                      aria-label={t("automations.toggle", { name: automation.name })}
                      onClick={() => void actions.toggle(automation)}
                    />
                  )}
                </div>
              );
            })}
          </Card>
        );
      })}
      {state.routinesLoadState === "error" && <Card><NoteRow tone="warn">{t("routines.loadError")}</NoteRow></Card>}
      {automations.length === 0 && state.routinesLoadState !== "error" && (
        <Card><NoteRow>{loading ? t("common.checking") : t("botPanel.automations.empty")}</NoteRow></Card>
      )}
      {actions.error && <p role="alert" className="mx-1 mt-2 text-[12px] text-danger">{actions.error}</p>}
      <Card>
        <LinkRow data-panel-link="new-automation" icon={Plus} onClick={() => dispatch({ type: "showRoutines", view: "list", compose: true })}>{t("botPanel.automations.new")}</LinkRow>
        {automations.length > 0 && (
          <LinkRow data-panel-link="all-automations" icon={ArrowUpRight} onClick={() => dispatch({ type: "showRoutines", view: "list" })}>{t("botPanel.automations.openAll")}</LinkRow>
        )}
      </Card>
      <p className="mx-1 mt-3 text-[13px] leading-normal text-ink-secondary">{t("botPanel.routines.ask", { name: bot.name })}</p>
    </>
  );
}
