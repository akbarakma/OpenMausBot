import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
const root = path.join(path.dirname(self), "..");

const PAGE = `<!doctype html><html><head><title>personal-ui</title>
<script src="/assets/server-only.js"></script><script src="/assets/app.js"></script></head><body></body></html>`;
const APP = `window.appSource = "bundle";
window.report = (async () => {
  const json = async (url, init) => (await fetch(url, init)).json();
  await fetch("/api/login", { method: "POST" });
  const stream = await new Promise((resolve, reject) => {
    const seen = []; const source = new EventSource("/api/events");
    const timer = setTimeout(() => reject(new Error("SSE timed out")), 10000);
    source.onmessage = event => { seen.push(event.data); if (seen.length === 2) { clearTimeout(timer); source.close(); resolve(seen); } };
  });
  const echo = await new Promise((resolve, reject) => {
    const socket = new WebSocket("ws://" + location.host + "/api/socket");
    const timer = setTimeout(() => reject(new Error("WebSocket timed out")), 10000);
    socket.onopen = () => socket.send("fixture-echo");
    socket.onmessage = event => { clearTimeout(timer); socket.close(); resolve(event.data); };
  });
  const bytes = new Uint8Array(3_000_000).map((_, index) => index % 251);
  const upload = await json("/api/upload", { method: "POST", body: new Blob([bytes]) });
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
  return { title: document.title, appSource: window.appSource, serverOnly: window.serverOnly, stream, echo,
    uploadMatches: upload.sha256 === digest, cookie: (await json("/api/whoami")).cookie, cookieHidden: !document.cookie.includes("fixture") };
})();`;

async function electronMain() {
  const { app, BrowserWindow } = await import("electron");
  const { attachPersonalUi } = await import("../electron/personal-ui.mjs");
  const [origin, dir, profile] = process.argv.slice(-3);
  app.setPath("userData", profile);
  app.setPath("sessionData", profile);
  const result = {};
  const finish = code => { process.stdout.write(`${JSON.stringify({ type: "personal-ui-result", ...result })}\n`); app.exit(code); };
  setTimeout(() => { result.error = `timed out at ${result.step}`; finish(1); }, 60_000).unref();
  try {
    await app.whenReady();
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    const contents = win.webContents;
    const logs = [];
    const step = name => { result.step = name; };
    step("attach");
    await attachPersonalUi(contents, { dir, origin: () => origin, log: line => logs.push(line) });
    await win.loadURL("data:text/html,<title>start</title>");
    step("load");
    await win.loadURL(origin);
    step("report");
    result.page = await contents.executeJavaScript("window.report");
    step("deep link");
    await win.loadURL(`${origin}/pair?code=fixture`);
    result.deepLink = await contents.executeJavaScript("document.title");
    await win.loadURL(`${origin}/mcp-oauth/callback`);
    result.callback = await contents.executeJavaScript("document.body.innerText");
    await win.loadURL(`${origin}/api/brand`);
    result.api = await contents.executeJavaScript("document.body.innerText");
    step("reload");
    contents.reload();
    await once(contents, "did-finish-load");
    result.reload = await contents.executeJavaScript("document.body.innerText");
    await win.loadURL(origin);
    result.afterReload = await contents.executeJavaScript("document.title");
    result.logs = logs;
    delete result.step;
    finish(0);
  } catch (error) {
    result.error = error?.stack ?? String(error);
    finish(1);
  }
}

async function fixtureMain() {
  const { WebSocketServer } = await import("ws");
  const temporary = mkdtempSync(path.join(tmpdir(), "personal-ui-verification-"));
  const bundle = path.join(temporary, "ui");
  mkdirSync(path.join(bundle, "assets"), { recursive: true });
  writeFileSync(path.join(bundle, "index.html"), PAGE);
  writeFileSync(path.join(bundle, "assets", "app.js"), APP);
  const output = path.join(root, "release", "personal-ui-verification");
  mkdirSync(output, { recursive: true });
  const requests = [];
  let server, sockets, child, logs = "";
  try {
    server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://fixture");
      const cookie = (req.headers.cookie ?? "").includes("omb_session_fixture=signed-in");
      requests.push({ method: req.method, path: url.pathname });
      if (url.pathname === "/api/login") { res.writeHead(204, { "set-cookie": "omb_session_fixture=signed-in; HttpOnly; Path=/" }); return res.end(); }
      if (url.pathname === "/api/whoami") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ cookie })); }
      if (url.pathname === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream" }); res.write("data: first\n\n");
        setTimeout(() => res.write("data: second\n\n"), 300); return;
      }
      if (url.pathname === "/api/upload") {
        const hash = createHash("sha256"); for await (const chunk of req) hash.update(chunk);
        res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ sha256: hash.digest("hex") }));
      }
      if (url.pathname === "/api/brand") { res.writeHead(200, { "content-type": "text/html" }); return res.end("server-api"); }
      if (url.pathname === "/mcp-oauth/callback") { res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); return res.end("server-callback"); }
      if (url.pathname === "/assets/app.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end('window.appSource = "server";'); }
      if (url.pathname === "/assets/server-only.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end('window.serverOnly = "server";'); }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<!doctype html><title>server-ui</title><body>server-ui</body>");
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    sockets = new WebSocketServer({ server });
    sockets.on("connection", socket => socket.on("message", (data, binary) => socket.send(data, { binary })));

    const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
    child = spawn(createRequire(import.meta.url)("electron"), [self, origin, bundle, path.join(temporary, "profile")], { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => { logs += bytes.toString(); });
    const [code] = await once(child, "exit", { signal: AbortSignal.timeout(90_000) });
    const line = logs.split("\n").find(entry => entry.startsWith('{"type":"personal-ui-result"'));
    assert.ok(line, `Electron reported nothing (exit ${code})`);
    const result = JSON.parse(line);
    assert.equal(result.error, undefined, result.error);
    assert.deepEqual(result.page, {
      title: "personal-ui", appSource: "bundle", serverOnly: "server", stream: ["first", "second"], echo: "fixture-echo",
      uploadMatches: true, cookie: true, cookieHidden: true,
    });
    assert.equal(result.deepLink, "personal-ui");
    assert.equal(result.callback, "server-callback");
    assert.equal(result.api, "server-api");
    assert.equal(result.reload, "server-api");
    assert.equal(result.afterReload, "personal-ui");
    assert.deepEqual(result.logs, []);
    assert.ok(!requests.some(request => request.path === "/assets/app.js"), "The bundled script must not be fetched from the server");
    writeFileSync(path.join(output, "receipt.json"), `${JSON.stringify({ passed: true, server: "isolated fixture", result, requests }, null, 2)}\n`);
    process.stdout.write("PASS: bundled pages and scripts; server-only files, API pages and OAuth callbacks from the server; cookies, SSE, WebSocket and a 3 MB upload unchanged.\n");
  } finally {
    if (child && child.exitCode === null) child.kill("SIGTERM");
    writeFileSync(path.join(output, "electron.log"), logs);
    for (const socket of sockets?.clients ?? []) socket.terminate();
    sockets?.close();
    server?.closeAllConnections();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    rmSync(temporary, { recursive: true, force: true });
  }
}

// Electron emits "ready" only after the entry module finishes, so its branch must not be awaited here.
if (process.versions.electron) void electronMain(); else await fixtureMain();
