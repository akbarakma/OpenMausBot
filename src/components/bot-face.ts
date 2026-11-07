import { useAdvancedMode } from "@/lib/interface-mode";
import { stateForBot, type MausState } from "@/lib/mascot";
import type { AppState, Bot, Message } from "@/state/store";
import type { BotAvatarProps } from "./Avatar";
import { useMotionBeat } from "./motion-beat";

const KEPT_WHILE_SELECTED = new Set<MausState>(["alerting", "curious"]);

export function botFaceState(bot: Bot, messages: Message[], running: boolean, selected: boolean): MausState {
  const face = { ...bot, busy: running, messages };
  if (!selected || running) return stateForBot(face);
  const live = stateForBot({ ...face, mascotExpression: null });
  return KEPT_WHILE_SELECTED.has(live) ? live : "happy";
}

const restOrigins = new Map<string, number>();

export function restOrigin(botId: string, resting: boolean, now = performance.now()): number | null {
  if (!resting) {
    restOrigins.delete(botId);
    return null;
  }
  const since = restOrigins.get(botId) ?? now;
  restOrigins.set(botId, since);
  return since;
}

type BotFace = Required<Pick<BotAvatarProps, "state" | "motion" | "motionKey" | "animated" | "working" | "greet" | "restingSince">>;

export function useBotFace({ bot, messages, running, selected, motion, noticing = false, hops = false }: {
  bot: Bot;
  messages: Message[];
  running: boolean;
  selected: boolean;
  motion: AppState["mascotMotion"];
  noticing?: boolean;
  hops?: boolean;
}): BotFace {
  const beat = useMotionBeat(motion);
  const advanced = useAdvancedMode();
  const simpleSelected = selected && !advanced;
  const state = botFaceState(bot, messages, running, simpleSelected);
  return {
    state,
    motion: beat ?? "none",
    motionKey: motion?.nonce ?? 0,
    animated: (simpleSelected && hops) || running || noticing || beat !== null,
    working: running,
    greet: beat === "switch",
    restingSince: hops ? restOrigin(bot.id, simpleSelected && !running && state === "happy" && beat === null) : null,
  };
}
