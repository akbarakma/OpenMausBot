import { readFileSync, statSync } from "node:fs";

import { browserDaemonFile } from "./browser-engine.ts";
import { processAlive } from "./browser-processes.ts";
import { browserRuntimeEnv } from "./browser-runtime.ts";
import { oneChatOn } from "./one-chat.ts";

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
  return port >= 1 && port <= 65_535 ? port : null;
}
