import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { WebSocket, WebSocketServer } from "ws";
import { createPersonalDevProxy, PERSONAL_DEV_HEADER, personalApiPath } from "./personal-dev-proxy.mjs";
import { personalDevOptions, personalServerOrigin, personalSessionCookies, personalSetup } from "./personal-dev-config.mjs";

const listen = async server => { server.listen(0, "127.0.0.1"); await once(server, "listening"); return `http://127.0.0.1:${server.address().port}`; };

test("Development options reject unsafe ports and non-fixture profile overrides", () => {
  assert.equal(personalDevOptions([]).port, 5199);
  assert.equal(personalDevOptions(["--port", "5200"]).port, 5200);
  for (const args of [["--port", "0"], ["--port", "invalid"], ["--port", "65536"], ["--profile", "/existing/profile"]]) {
    assert.throws(() => personalDevOptions(args));
  }
});

test("Session bootstrap reads only usable session cookies for the selected host without altering the source database", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "personal-cookie-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const db = new DatabaseSync(path.join(directory, "Cookies"));
  db.exec("CREATE TABLE cookies (host_key TEXT, name TEXT, value TEXT, path TEXT, is_secure INTEGER, is_httponly INTEGER, expires_utc INTEGER)");
  const put = db.prepare("INSERT INTO cookies VALUES (?, ?, ?, '/', 1, 1, ?)");
  const future = Math.round((Date.now() / 1000 + 11644473600 + 3600) * 1000000);
  put.run("bots.example", "omb_session_valid", "fixture-valid", future);
  put.run("bots.example", "omb_session_temporary", "fixture-temporary", 0);
  put.run("bots.example", "omb_session_expired", "fixture-expired", 1);
  put.run("bots.example", "omb_session_encrypted", "", future);
  put.run("bots.example", "ombXsessionXother", "unrelated", future);
  put.run("other.example", "omb_session_other", "other-host", future);
  db.close();
  const cookies = personalSessionCookies(directory, "https://bots.example");
  assert.deepEqual(cookies.map(cookie => cookie.name), ["omb_session_valid", "omb_session_temporary"]);
  assert.ok(cookies.every(cookie => cookie.httpOnly && cookie.secure && cookie.url === "https://bots.example"));
  assert.equal(cookies[1].expirationDate, undefined);
  const after = new DatabaseSync(path.join(directory, "Cookies"), { readOnly: true });
  assert.equal(after.prepare("SELECT COUNT(name) AS count FROM cookies").get().count, 6);
  after.close();
});

async function fixture(t, receive) {
  const upstream = createServer(receive);
  const origin = await listen(upstream);
  const proxy = createPersonalDevProxy({ origin, capability: "fixture-capability", cookies: async () => "omb_session_fixture=fixture-session" });
  const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end(); }));
  let middleware;
  const ui = await listen(server);
  proxy.plugin.configureServer({ config: { server: { port: server.address().port } }, httpServer: server, middlewares: { use: handler => { middleware = handler; } } });
  t.after(async () => {
    proxy.close();
    server.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
  });
  const headers = { [PERSONAL_DEV_HEADER]: "fixture-capability", origin: ui };
  return { ui, origin, headers, upstream };
}

test("Personal configuration accepts HTTPS origins and rejects credential-bearing or ambiguous addresses", () => {
  assert.equal(personalServerOrigin("https://bots.example:8445/"), "https://bots.example:8445");
  for (const value of ["http://bots.example", "https://owner:secret@bots.example", "https://bots.example/api", "https://bots.example/?code=secret", "https://bots.example/#secret"]) {
    assert.throws(() => personalServerOrigin(value));
  }
  assert.equal(personalServerOrigin("http://127.0.0.1:8445", true), "http://127.0.0.1:8445");
  assert.throws(() => personalServerOrigin("http://192.168.1.2", true));
});

test("Personal setup selects the installed connection without importing identity or credentials", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "personal-setup-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const profile = path.join(directory, "OpenMausBot Personal"); mkdirSync(profile);
  writeFileSync(path.join(profile, "environments.json"), JSON.stringify({ activeId: "remote", environments: [{ id: "remote", kind: "remote", origin: "https://bots.example", name: "My server", color: "blue" }] }));
  writeFileSync(path.join(profile, "desktop-prefs.json"), JSON.stringify({ analytics: false, windowFrame: false, installId: "private-identity", secret: "fixture-secret" }));
  const setup = personalSetup(directory);
  assert.equal(setup.origin, "https://bots.example");
  assert.equal(setup.name, "My server");
  assert.deepEqual(setup.preferences, { analytics: false, windowFrame: false });
});

test("Only API paths reach the remote server", () => {
  assert.equal(personalApiPath("/api/bots?page=1"), "/api/bots?page=1");
  assert.equal(personalApiPath("/.well-known/openmausbot/environment"), "/.well-known/openmausbot/environment");
  for (const value of ["https://other.example/api/bots", "//other.example/api/bots", "/api/../private", "/api/../../api/../", "/src/main.tsx", "/api\\other"]) assert.equal(personalApiPath(value), null);
});

test("The relay rejects unauthenticated and cross-origin callers without contacting the server", { timeout: 10_000 }, async t => {
  let calls = 0;
  const setup = await fixture(t, (_req, res) => { calls++; res.end("unexpected"); });
  assert.equal((await fetch(`${setup.ui}/api/config`)).status, 403);
  assert.equal((await fetch(`${setup.ui}/api/config`, { headers: { ...setup.headers, origin: "https://other.example" } })).status, 403);
  assert.equal(calls, 0);
});

test("The relay preserves methods, uploads, status and remote CSRF checks while keeping credentials private", { timeout: 10_000 }, async t => {
  let received;
  const setup = await fixture(t, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() };
    res.writeHead(201, { "content-type": "application/json", "set-cookie": "omb_session_fixture=must-not-leak" });
    res.end(JSON.stringify({ saved: true }));
  });
  const response = await fetch(`${setup.ui}/api/fixture?x=1`, {
    method: "POST", headers: { ...setup.headers, cookie: "forged-cookie", authorization: "forged-bearer", "x-forwarded-host": "forged", "content-type": "application/json" }, body: '{"name":"example"}',
  });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { saved: true });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(received.method, "POST"); assert.equal(received.url, "/api/fixture?x=1");
  assert.equal(received.body, '{"name":"example"}');
  assert.equal(received.headers.cookie, "omb_session_fixture=fixture-session");
  assert.equal(received.headers.origin, setup.origin);
  for (const key of [PERSONAL_DEV_HEADER, "authorization", "x-forwarded-host"]) assert.equal(received.headers[key], undefined);
});

test("SSE events stream before the upstream response ends and disconnects cancel the upstream request", { timeout: 10_000 }, async t => {
  let disconnected;
  const ended = new Promise(resolve => { disconnected = resolve; });
  const setup = await fixture(t, (req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" }); res.write('data: {"ready":true}\n\n');
    req.on("close", disconnected);
  });
  const controller = new AbortController();
  const response = await fetch(`${setup.ui}/api/events`, { headers: setup.headers, signal: controller.signal });
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /ready/);
  controller.abort();
  await ended;
});

test("WebSockets authenticate to the same server and preserve binary frames", { timeout: 10_000 }, async t => {
  const setup = await fixture(t, (_req, res) => res.end());
  const backend = new WebSocketServer({ server: setup.upstream });
  let headers;
  backend.on("connection", (socket, req) => { headers = req.headers; socket.on("message", (data, binary) => socket.send(data, { binary })); });
  t.after(() => backend.close());
  const socket = new WebSocket(`${setup.ui.replace("http:", "ws:")}/api/socket`, { headers: setup.headers });
  t.after(() => socket.terminate());
  await once(socket, "open");
  const answer = once(socket, "message"); socket.send(Buffer.from([1, 2, 3]));
  const [data, binary] = await answer;
  assert.deepEqual(data, Buffer.from([1, 2, 3])); assert.equal(binary, true);
  assert.equal(headers.cookie, "omb_session_fixture=fixture-session");
  assert.equal(headers.origin, setup.origin); assert.equal(headers[PERSONAL_DEV_HEADER], undefined);
});
