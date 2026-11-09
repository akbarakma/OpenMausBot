import { useState } from "react";
import { Globe, Monitor } from "lucide-react";

import { cn } from "@/lib/cn";
import { writeComputerPanelView, type ComputerPanelView } from "@/lib/computer-panel-view";
import { browserAvailable, browserUnavailableReason, builtInBrowserEnabled } from "@/lib/feature-flags";
import { t } from "@/lib/i18n";
import { pageOnRemoteServer } from "@/lib/local-computer";
import { personPin, type Place } from "@/lib/place";
import { placeHasIssue, worksOnSimpleLabel } from "@/lib/place-view";
import { api, currentTaskBot, useStore, type Bot, type ConfigStatus } from "@/state/store";
import { useDesktopCapabilities } from "../DesktopCapabilities";
import { LocalComputerAutoWarning } from "../LocalComputerAutoWarning";
import { usePlaceViews } from "../PlaceChip";
import { screenFramePreview } from "../ScreenFrame";
import type { BotPatch, useBotSettingsDerived } from "../bot-settings/useBotSettingsDerived";
import type { SimplePageId } from "./page-registry";
import { openBrowserWindow, useBrowserWindow, useHoldGrace } from "./browser-window";
import { browsingNow, useBrowsingHeld } from "./simple-side-panel";
import { LiveBrowserCard } from "./LiveBrowserCard";
import { BotSwitch, buttonCls, Card, CardLabel, CardSurface, NavRow, RadioRow, RowIcon, RowText, switchRowCls } from "./rows";

type Derived = ReturnType<typeof useBotSettingsDerived>;
type PlaceChoice = "auto" | Place | "off";

interface PlaceOption {
  value: PlaceChoice;
  label: string;
  hint?: string;
  disabled?: boolean;
}

const OFF_LABEL = () => t("place.off");

export function useOpenComputer(bot: Pick<Bot, "id">) {
  const { dispatch } = useStore();
  return (view: ComputerPanelView = "computer") => {
    writeComputerPanelView(bot.id, view);
    dispatch({ type: "toggleSettings", open: false });
    dispatch({ type: "toggleComputer", open: true });
  };
}

function usePlaceChoices(bot: Bot) {
  const { state } = useStore();
  const { capabilities } = useDesktopCapabilities();
  const platform = capabilities.host?.platform ?? "other";
  const placeViews = usePlaceViews(bot);
  const current: PlaceChoice = bot.computer ?? "auto";
  const myChrome = state.config?.browserEngine?.myChrome === true
    && (state.config?.browserProfiles ?? []).some((profile) => profile.id === bot.browserProfile && profile.browser === "chrome");
  const placeLabel = (place: Place) => (place === "browser" && myChrome ? t("settings.profiles.myChrome") : worksOnSimpleLabel(place, platform));
  const choice = (place: Place): PlaceOption => {
    const { view, reachable } = placeViews[place];
    return { value: place, label: placeLabel(place), disabled: !reachable, hint: !reachable || placeHasIssue(view) ? view.line : undefined };
  };
  const options: PlaceOption[] = [
    { value: "auto", label: t("computer.simple.dest.letItChoose") },
    ...(placeViews.local.policy ? [choice("local")] : []),
    ...(placeViews.browser.policy || current === "browser" ? [choice("browser")] : []),
    ...(placeViews.cloud.policy ? [choice("cloud")] : []),
    // Offered as in the Screen panel and the composer, so a bot can be kept on the private desktop from here too.
    ...(placeViews.vm.policy || current === "vm" ? [choice("vm")] : []),
    ...(current === "off" ? [{ value: current, label: OFF_LABEL(), disabled: true }] : []),
  ];
  const liveSurface = bot.tasks?.find((task) => task.threadId === bot.threadId)?.surface;
  const usingNow = liveSurface && liveSurface !== current ? placeLabel(liveSurface) : null;
  const currentLabel = options.find((option) => option.value === current)?.label
    ?? (current === "auto" || current === "off" ? undefined : placeLabel(current));
  return { options, current, currentLabel, usingNow, placeLabel };
}

export function WherePage({ bot, derived }: { bot: Bot; derived: Derived }) {
  const { dispatch } = useStore();
  const { capabilities } = useDesktopCapabilities();
  const { options, current, currentLabel, usingNow, placeLabel } = usePlaceChoices(bot);
  const pin = personPin(bot.tasks?.find((task) => task.threadId === bot.threadId));
  const heldPin = pin && bot.computer !== "off" && pin !== bot.computer ? pin : undefined;
  const unpin = () => {
    if (bot.computer === "local" && pageOnRemoteServer(capabilities)) dispatch({ type: "updateBot", botId: bot.id, patch: { computer: null } });
    dispatch({ type: "updateTask", botId: bot.id, threadId: bot.threadId, patch: { surface: null } });
  };
  const [localAutoWarning, setLocalAutoWarning] = useState<{ botId: string; patch: BotPatch } | null>(null);
  const { patch, approvalMode } = derived;
  const choosePlace = (value: PlaceChoice) => {
    if (value === current || value === "off") return;
    if (value === "local" && approvalMode === "auto") {
      setLocalAutoWarning({ botId: bot.id, patch: { computer: "local", acknowledgeLocalAuto: true } });
      return;
    }
    patch(value === "browser" ? { computer: "browser", browser: true } : { computer: value === "auto" ? null : value });
  };

  return (
    <>
      <Card>
        <div role="radiogroup" aria-label={t("computer.simple.whereWorks", { name: bot.name })} className="flex flex-col divide-y divide-ink/[0.05]">
          {options.map((option) => (
            <RadioRow
              key={option.value}
              data-panel-choice={option.value}
              title={option.label}
              hint={option.hint}
              checked={current === option.value}
              disabled={option.disabled}
              onClick={() => choosePlace(option.value)}
            />
          ))}
        </div>
      </Card>
      {heldPin ? (
        <div data-panel-pinned-place className="mx-1 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[13px] text-ink-secondary">{t("place.pinnedNoteSimple", { place: placeLabel(heldPin) })}</p>
          <button type="button" disabled={Boolean(bot.busy)} title={bot.busy ? t("place.busy") : undefined} onClick={unpin} className={buttonCls}>
            {t("place.unpinSimple", { place: currentLabel ?? t("computer.simple.dest.letItChoose") })}
          </button>
        </div>
      ) : usingNow && <p data-panel-using-now className="mx-1 text-[13px] text-ink-secondary">{t("computer.simple.usingNow", { place: usingNow })}</p>}
      <LocalComputerAutoWarning
        open={localAutoWarning !== null}
        onCancel={() => setLocalAutoWarning(null)}
        onConfirm={() => {
          const target = localAutoWarning;
          setLocalAutoWarning(null);
          if (!target) return;
          dispatch({ type: "updateBot", botId: target.botId, patch: target.patch });
        }}
      />
    </>
  );
}

export function ComputerCard({ bot, onOpen }: { bot: Bot; onOpen: (page: SimplePageId) => void }) {
  const { state, dispatch } = useStore();
  const openComputer = useOpenComputer(bot);
  const browserWindow = useBrowserWindow();
  const { currentLabel } = usePlaceChoices(bot);
  const [turningOn, setTurningOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canTurnOn = browserAvailable(state.config) || state.config?.browserEngine?.installable === true;
  const browserOn = builtInBrowserEnabled(state.config) && bot.browser !== false && canTurnOn;
  const browserPlace = bot.computer === undefined || bot.computer === "browser";
  const showsBrowser = browserOn && browserPlace;
  // The card connects only while the turn uses the browser: opening a view starts the bot's browser when it is asleep.
  const turnBrowses = browsingNow(currentTaskBot(bot));
  const held = useBrowsingHeld(bot.id, turnBrowses);
  const browsing = showsBrowser && turnBrowses;
  const graceRunning = useHoldGrace(bot.id);
  const streaming = showsBrowser && held && !browserWindow && !graceRunning;
  const label = browserPlace ? t("browser.card.title") : t("chat.botScreen");

  const screen = browserPlace ? undefined : [...bot.messages].reverse().find((message) => message.kind === "screen" && (message.hasImage || message.png));
  const screenSrc = screen ? screenFramePreview({ threadId: bot.threadId, messageId: screen.id }, screen.mime).src : null;
  const open = () => (showsBrowser ? openBrowserWindow(bot.id) : openComputer());
  const openLabel = `${t("computer.open")}: ${label}`;

  const turnOnBrowser = async () => {
    if (turningOn) return;
    setTurningOn(true);
    setError(null);
    try {
      if (!builtInBrowserEnabled(state.config)) {
        const config: ConfigStatus = await api("/api/config", { method: "PATCH", body: JSON.stringify({ features: { browser: true } }) });
        dispatch({ type: "configStatus", config });
      }
      if (bot.browser === false) dispatch({ type: "updateBot", botId: bot.id, patch: { browser: true } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("settings.experimental.error"));
    } finally {
      setTurningOn(false);
    }
  };
  const turnOffBrowser = () => {
    setError(null);
    dispatch({ type: "updateBot", botId: bot.id, patch: { browser: false } });
  };

  return (
    <section data-panel-card="computer">
      <CardLabel>{t(browserPlace ? "computer.tab.browser" : "computer.tab.computer")}</CardLabel>
      <CardSurface>
        {(showsBrowser || !browserPlace) && (
          <button
            type="button"
            data-panel-action="open-computer"
            aria-label={openLabel}
            onClick={open}
            className="flex w-full cursor-pointer items-center gap-3 py-[9px] pr-[18px] pl-3.5 text-left hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-border"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[14px] font-medium text-ink">{label}</span>
              <span className="flex items-center gap-1.5 text-[13px] text-ink-secondary">
                {streaming && <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-full", browsing ? "animate-pulse bg-success" : "bg-ink-tertiary")} />}
                {streaming ? t(browsing ? "browser.card.browsing" : "browser.card.done") : t("botPanel.face.sleeping")}
              </span>
            </span>
            <span className="relative flex h-[45px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-ink/[0.04]">
              {streaming ? (
                <span className="absolute inset-0"><LiveBrowserCard bot={bot} /></span>
              ) : screenSrc ? (
                <img src={screenSrc} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <span aria-hidden="true" className="panel-zzz text-[11px] font-semibold text-ink-secondary"><span>z</span><span>z</span><span>Z</span></span>
              )}
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[8px] ring-1 ring-inset ring-ink/[0.08]" />
            </span>
          </button>
        )}
        <NavRow
          data-panel-page="where"
          icon={Monitor}
          title={t("botPanel.worksIn")}
          value={currentLabel}
          onClick={() => onOpen("where")}
        />
        <label data-panel-row="browser-switch" className={switchRowCls}>
          <RowIcon icon={Globe} />
          <RowText
            title={t("browser.card.switch")}
            hint={!canTurnOn ? browserUnavailableReason(state.config) : undefined}
          />
          <BotSwitch
            color={bot.color}
            checked={browserOn}
            disabled={turningOn || (!browserOn && !canTurnOn)}
            aria-label={t("browser.card.switch")}
            onClick={() => (browserOn ? turnOffBrowser() : void turnOnBrowser())}
          />
        </label>
      </CardSurface>
      {error && <p role="alert" className="mx-1 mt-2 text-[12px] text-danger">{error}</p>}
    </section>
  );
}
