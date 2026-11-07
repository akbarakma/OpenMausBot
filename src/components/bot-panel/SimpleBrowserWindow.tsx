import { Shrink } from "lucide-react";
import { useEffect, useState } from "react";

import { usePanelPage } from "@/lib/page-open";
import { t } from "@/lib/i18n";
import { useStore } from "@/state/store";
import { BrowserPanel, LiveBrowser, type BrowserPage } from "../BrowserPanel";
import { useCaptionChrome, useDesktopCapabilities } from "../DesktopCapabilities";
import { SignInBanner } from "../SignInRequestCard";
import { closeBrowserWindow, useBrowserWindow } from "./browser-window";
import { buttonCls } from "./rows";

export function SimpleBrowserWindow() {
  const request = useBrowserWindow();
  const { state } = useStore();
  const bot = request ? state.bots.find((candidate) => candidate.id === request.botId) : undefined;
  const selectedId = state.selectedId;

  useEffect(() => {
    if (request && (!bot || selectedId !== request.botId)) closeBrowserWindow();
  }, [request, bot, selectedId]);

  if (!request || !bot) return null;
  return <BrowserWindow key={bot.id} botId={bot.id} />;
}

function BrowserWindow({ botId }: { botId: string }) {
  const request = useBrowserWindow();
  const { state } = useStore();
  const { dragProps } = useCaptionChrome();
  const macInset = useDesktopCapabilities().capabilities.windowChrome === "mac-inset";
  const [page, setPage] = useState<BrowserPage>();
  usePanelPage(botId, setPage);
  const bot = state.bots.find((candidate) => candidate.id === botId);
  if (!bot) return null;

  const help = state.computerControl?.[bot.id]?.help;
  const signInHelp = help?.place === "browser" ? help : null;
  const asker = signInHelp ? state.bots.find((candidate) => candidate.id === signInHelp.botId)?.name ?? bot.name : bot.name;
  const engine = state.config?.browserEngine;
  const ready = bot.browser !== false && engine?.kind === "engine" && !engine.installing && !engine.installError;

  if (ready) {
    return (
      <LiveBrowser
        bot={bot}
        signIn={request?.signIn}
        page={page}
        window={{ onBack: closeBrowserWindow, banner: signInHelp ? <SignInBanner help={signInHelp} askerName={asker} /> : undefined }}
      />
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-card text-ink">
      <div {...dragProps} className={`flex h-[60px] shrink-0 items-center justify-end border-b border-hairline/30 bg-panel pr-3 ${macInset ? "pl-[84px]" : "pl-3"}`}>
        <button type="button" className={buttonCls} onClick={closeBrowserWindow}>
          <Shrink size={14} aria-hidden="true" />
          {t("browser.window.back")}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <BrowserPanel bot={bot} />
      </div>
    </div>
  );
}
