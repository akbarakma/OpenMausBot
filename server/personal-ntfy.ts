import { z } from "zod";

import { oneChatOn } from "./one-chat.ts";

export const NTFY_TOPIC_ENV = "OMB_NTFY_TOPIC";
export const NTFY_URL_ENV = "OMB_NTFY_URL";
const NTFY_URL = "https://ntfy.sh";
const URGENT_KINDS = new Set(["approval", "question", "sign-in"]);
const TEXT_MAX = 200;

const alertSchema = z.object({
  kind: z.enum(["approval", "question", "sign-in", "done"]),
  title: z.string(),
  body: z.string().optional(),
  threadId: z.string().min(1),
});

type Env = Record<string, string | undefined>;

export interface NtfyMessage {
  topic: string;
  title: string;
  message: string;
  click: string;
  priority: number;
}

function clip(text: string): string {
  const points = [...text.replace(/\s+/gu, " ").trim()];
  return points.length > TEXT_MAX ? `${points.slice(0, TEXT_MAX - 1).join("")}…` : points.join("");
}

export function ntfyMessage(notification: unknown, topic: string): NtfyMessage | null {
  const parsed = alertSchema.safeParse(notification);
  if (!parsed.success) return null;
  const { kind, title, body, threadId } = parsed.data;
  return {
    topic,
    title: clip(title),
    message: clip(body ?? "") || clip(title),
    click: `openmausbot://chat/${encodeURIComponent(threadId)}`,
    priority: URGENT_KINDS.has(kind) ? 4 : 3,
  };
}

/** Publishes a `notify` frame to the ntfy topic in OMB_NTFY_TOPIC, unless the iPhone app holds a live stream. Never throws. */
export function sendNtfy(input: {
  notification: unknown;
  phoneLive: () => boolean;
  env?: Env;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}): Promise<void> {
  const { notification, phoneLive, env = process.env, fetchImpl = fetch, log = (line) => console.log(line) } = input;
  const topic = env[NTFY_TOPIC_ENV]?.trim();
  if (!topic || !oneChatOn(env)) return Promise.resolve();
  const message = ntfyMessage(notification, topic);
  if (!message || phoneLive()) return Promise.resolve();
  return fetchImpl(env[NTFY_URL_ENV]?.trim() || NTFY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10_000),
  }).then(
    (response) => { if (!response.ok) log(`[ntfy] publish answered ${response.status}`); },
    (error: unknown) => { log(`[ntfy] publish failed: ${error instanceof Error ? error.name : "error"}`); },
  );
}
