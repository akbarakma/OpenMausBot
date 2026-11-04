import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { WebSocketServer } from "ws";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "personal-dev-verification-"));
const ui = path.join(temporary, "ui"); mkdirSync(ui);
const output = path.join(root, "release", "personal-dev-verification"); mkdirSync(output, { recursive: true });
const reports = [];
const requests = [];
let child;
let server;
let sockets;
let pendingReport;
let logs = "";
const nextReport = () => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("No development fixture report within 45 seconds")), 45_000);
  pendingReport = value => { clearTimeout(timer); pendingReport = null; resolve(value); };
});

try {
  server = createServer(async (req, res) => {
    requests.push({ path: req.url, cookie: req.headers.cookie === "omb_session_fixture=fixture-session", origin: req.headers.origin });
    if (req.headers.cookie !== "omb_session_fixture=fixture-session") { res.writeHead(401); res.end(); return; }
    if (req.url === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream" }); res.write("data: fixture-stream\n\n"); return;
    }
    if (req.url === "/api/fixture-report") {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const report = JSON.parse(Buffer.concat(chunks).toString()); reports.push(report); pendingReport?.(report);
    }
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ app: "openmausbot", fixture: true }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const upstream = `http://127.0.0.1:${server.address().port}`;
  sockets = new WebSocketServer({ server });
  sockets.on("connection", socket => socket.on("message", (data, binary) => socket.send(data, { binary })));
  const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));

  writeFileSync(path.join(ui, "label.js"), 'export default "before-edit";\n');
  writeFileSync(path.join(ui, "index.html"), `<!doctype html><html><body><main id="label"></main><script type="module">
import label from '/label.js';
const boot = crypto.randomUUID();
const event = new Promise((resolve, reject) => {
  const source = new EventSource('/api/events');
  const timer = setTimeout(() => reject(new Error('SSE timed out')), 10000);
  source.onmessage = message => { clearTimeout(timer); source.close(); resolve(message.data); };
});
const webSocket = new Promise((resolve, reject) => {
  const socket = new WebSocket('ws://' + location.host + '/api/socket');
  const timer = setTimeout(() => reject(new Error('WebSocket timed out')), 10000);
  socket.onopen = () => socket.send('fixture-echo');
  socket.onmessage = message => { clearTimeout(timer); socket.close(); resolve(message.data); };
});
const capabilities = await window.ogb.getCapabilities();
const stream = await event, echo = await webSocket;
async function paint(text) {
  document.querySelector('#label').textContent = text;
  await fetch('/api/fixture-report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    text, boot, stream, echo, localControl: capabilities.localComputer.available,
    isolated: typeof window.require === 'undefined' && !window.ogb.companion && !window.ogb.computerSharing,
    cookieVisible: document.cookie.includes('fixture-session')
  }) });
}
await paint(label);
if (import.meta.hot) import.meta.hot.accept('/label.js', next => { void paint(next.default); });
</script></body></html>`);
  const first = nextReport();
  child = spawn(process.execPath, [path.join(root, "scripts/dev-personal.mjs"), "--fixture", ui, "--profile", path.join(temporary, "profile"), "--server", upstream, "--port", String(port), "--verify"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => { logs += bytes.toString(); });
  const initial = await first;
  assert.equal(initial.text, "before-edit");
  assert.equal(initial.stream, "fixture-stream"); assert.equal(initial.echo, "fixture-echo");
  assert.equal(initial.localControl, false); assert.equal(initial.isolated, true); assert.equal(initial.cookieVisible, false);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 403);
  const next = nextReport(); writeFileSync(path.join(ui, "label.js"), 'export default "after-edit";\n');
  const updated = await next;
  assert.equal(updated.text, "after-edit"); assert.equal(updated.boot, initial.boot, "The source edit must update without a full page reload");
  await assert.rejects(promisify(execFile)(process.execPath, [path.join(root, "scripts/dev-personal.mjs"),
    "--fixture", ui, "--profile", path.join(temporary, "busy-profile"), "--server", upstream, "--port", String(port)],
  { cwd: root, timeout: 15_000 }), error => error.code === 1 && /already in use/.test(error.stderr));
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 403);
  assert.ok(requests.every(request => request.cookie && request.origin === upstream));
  const receipt = { passed: true, uiPort: port, server: "isolated fixture", reports, authenticatedRequests: requests.length };
  writeFileSync(path.join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  process.stdout.write("PASS: authenticated HTTP, SSE and WebSocket; protected loopback API; isolated desktop bridge; live module update without reinstall.\n");
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit", { signal: AbortSignal.timeout(10_000) }).catch(() => {});
  }
  writeFileSync(path.join(output, "electron.log"), logs);
  for (const socket of sockets?.clients ?? []) socket.terminate();
  sockets?.close();
  server?.closeAllConnections();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  const contents = readdirSync(temporary);
  if (contents.every(name => ["ui", "profile", "busy-profile"].includes(name))) rmSync(temporary, { recursive: true, force: true });
}
