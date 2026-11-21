import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { localDevToolsUrl } from "./browser-dialogs.ts";
import { browserDaemonFile } from "./browser-engine.ts";
import { processAlive } from "./browser-processes.ts";
import { browserRuntimeEnv } from "./browser-runtime.ts";
import { oneChatOn } from "./one-chat.ts";

const PROFILE_HANDOFF_MS = 30_000;
const profileByPort = new Map<number, { profile: string; since: number; at: number }>();

function daemonFile(path: string): { text: string; mtimeMs: number } | null {
  try { return { text: readFileSync(path, "utf8").trim(), mtimeMs: statSync(path).mtimeMs }; } catch { return null; }
}

/**
 * The stream port of the session's running agent-browser daemon, read from the files it writes, so a live view opens
 * while a bot command holds the daemon: agent-browser 0.37 answers `stream status` only after that command, while its
 * stream server sends frames throughout. Null outside work in the session, where the usual status check is cheap.
 */
export function streamPortWhileWorking(session: string, env: Record<string, string | undefined> | undefined, working: boolean, alive: (pid: number) => boolean = processAlive): number | null {
  if (!oneChatOn() || !working) return null;
  const daemonEnv = browserRuntimeEnv({ ...env, AGENT_BROWSER_SESSION: session });
  const pid = daemonFile(browserDaemonFile(daemonEnv, ".pid"));
  const stream = daemonFile(browserDaemonFile(daemonEnv, ".stream"));
  if (!pid || !stream || !/^\d{1,9}$/.test(pid.text) || !/^\d{1,5}$/.test(stream.text)) return null;
  // Security: a daemon that died without cleanup leaves both files, and its port may since belong to another bot's
  // browser. The live daemon wrote its .pid at start, so only a .stream written after it is that daemon's.
  if (stream.mtimeMs < pid.mtimeMs || !alive(Number(pid.text))) return null;
  const port = Number(stream.text);
  if (port < 1 || port > 65_535) return null;
  if (env?.AGENT_BROWSER_PROFILE) profileByPort.set(port, { profile: env.AGENT_BROWSER_PROFILE, since: pid.mtimeMs, at: Date.now() });
  return port;
}

/**
 * The DevTools address of the Chrome behind a port `streamPortWhileWorking` just gave, from the DevToolsActivePort file
 * Chrome writes in its profile, since the daemon's `cdp_url` also waits for the bot's command. Each port answers once.
 */
export function devToolsUrlWhileWorking(port: number): string | null {
  const entry = profileByPort.get(port);
  profileByPort.delete(port);
  if (!entry || Date.now() - entry.at > PROFILE_HANDOFF_MS) return null;
  const file = daemonFile(join(entry.profile, "DevToolsActivePort"));
  // A Chrome that closed leaves its file behind; only one written since the daemon started is the running Chrome's.
  if (!file || file.mtimeMs < entry.since) return null;
  const [devToolsPort, path] = file.text.split("\n");
  return localDevToolsUrl(`ws://127.0.0.1:${devToolsPort}${path}`);
}
