import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserLive } from "./browser-live.ts";
import type { BrowserRuntime } from "./browser-runtime.ts";
import { streamPortWhileWorking } from "./personal-browser-stream.ts";

const execute = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  const { promisify } = await import("node:util");
  return { ...actual, execFile: Object.assign(vi.fn(), { [promisify.custom]: execute }) };
});

const SESSION = "bot-a";
let socketDir: string;
const env = () => ({ AGENT_BROWSER_SESSION: SESSION, AGENT_BROWSER_SOCKET_DIR: socketDir });
const alive = () => true;

function daemon({ pid = "4242", stream = "43210", streamAge = 0 }: { pid?: string; stream?: string; streamAge?: number } = {}) {
  writeFileSync(join(socketDir, `${SESSION}.pid`), `${pid}\n`);
  writeFileSync(join(socketDir, `${SESSION}.stream`), `${stream}\n`);
  if (streamAge) {
    const then = new Date(Date.now() - streamAge);
    utimesSync(join(socketDir, `${SESSION}.stream`), then, then);
  }
}

beforeEach(() => {
  socketDir = mkdtempSync(join(tmpdir(), "omb-stream-port-"));
  vi.stubEnv("OMB_ONE_CHAT", "1");
  execute.mockReset();
});
afterEach(() => { rmSync(socketDir, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("streamPortWhileWorking", () => {
  it("reads the running daemon's stream port while work holds the session", () => {
    daemon();
    expect(streamPortWhileWorking(SESSION, env(), true, alive)).toBe(43210);
  });

  it("leaves the usual status check in place when one chat is off or nothing works in the session", () => {
    daemon();
    expect(streamPortWhileWorking(SESSION, env(), false, alive)).toBeNull();
    vi.stubEnv("OMB_ONE_CHAT", "0");
    expect(streamPortWhileWorking(SESSION, env(), true, alive)).toBeNull();
  });

  it("refuses a port a dead or replaced daemon left behind", () => {
    daemon();
    expect(streamPortWhileWorking(SESSION, env(), true, () => false)).toBeNull();
    daemon({ streamAge: 60_000 });
    expect(streamPortWhileWorking(SESSION, env(), true, alive)).toBeNull();
  });

  it("refuses missing or malformed daemon files", () => {
    expect(streamPortWhileWorking(SESSION, env(), true, alive)).toBeNull();
    daemon({ stream: "70000" });
    expect(streamPortWhileWorking(SESSION, env(), true, alive)).toBeNull();
    daemon({ pid: "abc" });
    expect(streamPortWhileWorking(SESSION, env(), true, alive)).toBeNull();
  });
});

class ResponseFixture extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  headersSent = false;
  writableLength = 0;
  chunks: string[] = [];
  writeHead() { this.headersSent = true; }
  flushHeaders() {}
  write(value: string) { this.chunks.push(value); return true; }
  end() { this.writableEnded = true; }
  destroy() { this.destroyed = true; this.emit("close"); }
  events(type: string) { return this.chunks.filter((chunk) => chunk.startsWith(`event: ${type}\n`)); }
}

class SocketFixture extends EventTarget {
  static urls: string[] = [];
  readyState = 1;
  bufferedAmount = 0;
  constructor(url: string) { super(); SocketFixture.urls.push(url); queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
  send() {}
  close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
}

describe("a live view opened while a bot command holds the browser", () => {
  it("connects to the daemon's stream at once instead of waiting for the status check", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
    SocketFixture.urls = [];
    vi.stubGlobal("WebSocket", SocketFixture);
    daemon({ pid: String(process.pid) });
    const runtime = {
      heldBy: () => undefined, watch: () => () => {}, onIdleClose: () => {}, settled: async () => {}, working: () => true,
      launchReady: async () => {}, launched: async () => {}, interrupted: () => false, pageSizes: { resize: async () => {} },
    } as unknown as BrowserRuntime;
    const live = new BrowserLive({ runtime });
    execute.mockRejectedValue(Object.assign(new Error("Command failed: agent-browser stream status"), { killed: true, signal: "SIGKILL", code: null }));
    const res = new ResponseFixture();
    await live.open({ botId: "bot-a", session: SESSION, owner: "admin-a", isCurrent: () => true, res: res as unknown as ServerResponse,
      spec: { command: "/engine", env: env() } });
    expect(res.events("ready")).toHaveLength(1);
    expect(res.events("waiting")).toHaveLength(0);
    expect(SocketFixture.urls[0]).toContain("ws://127.0.0.1:43210/");
    expect(execute).not.toHaveBeenCalled();
    live.closeAll();
    vi.useRealTimers();
  });
});
