import assert from "node:assert/strict";
import { test } from "node:test";
import { blockLocalServer, noServerPage, personalClient, personalFallback, personalMenu, unreachablePage } from "./personal-client.mjs";
import { PERSONAL_APP_NAME } from "./personal-ui.mjs";

const personal = { isPackaged: true, getName: () => PERSONAL_APP_NAME };
const official = { isPackaged: true, getName: () => "OpenMausBot" };
const bb1 = { id: "bb1", kind: "remote", name: "bb-1", origin: "https://bb-1.example:8445" };
const local = "http://127.0.0.1:8799/?desktop-settings=workspaces";
const decoded = url => decodeURIComponent(url.slice(url.indexOf(",") + 1));

test("only the packaged Personal app is a client", () => {
  assert.equal(personalClient(personal), true);
  assert.equal(personalClient(official), false);
  assert.equal(personalClient({ ...personal, isPackaged: false }), false);
});

test("a failed local page opens the saved server and makes it active", () => {
  assert.deepEqual(personalFallback({ failedUrl: local, reason: "ERR_BLOCKED_BY_CLIENT", state: { activeId: "local", environments: [bb1] } }), { id: "bb1", url: bb1.origin });
  assert.deepEqual(personalFallback({ failedUrl: "http://localhost:18799/", reason: "x", state: { activeId: "bb1", environments: [bb1] } }), { id: "bb1", url: bb1.origin });
});

test("an unreachable server shows a page that keeps it active and retries it", () => {
  const next = personalFallback({ failedUrl: `${bb1.origin}/chat/1`, reason: "ERR_NAME_NOT_RESOLVED", state: { activeId: "bb1", environments: [bb1] } });
  assert.equal(next.id, "bb1");
  assert.match(decoded(next.url), /Can&#39;t reach bb-1[\s\S]*ERR_NAME_NOT_RESOLVED · bb-1.example:8445[\s\S]*const target = "https:\/\/bb-1.example:8445\/"/);
});

test("with no saved server a local page asks for a pairing link", () => {
  assert.deepEqual(personalFallback({ failedUrl: local, reason: "x", state: { activeId: "local", environments: [] } }), { id: null, url: noServerPage() });
});

test("failures elsewhere are left alone", () => {
  const state = { activeId: "bb1", environments: [bb1] };
  assert.equal(personalFallback({ failedUrl: "https://accounts.example/login", reason: "x", state }), null);
  assert.equal(personalFallback({ failedUrl: "http://127.0.0.1:5199/", reason: "x", state }), null);
  assert.equal(personalFallback({ failedUrl: "data:text/html,x", reason: "x", state }), null);
});

test("server names and reasons cannot break out of the page", () => {
  const page = decoded(unreachablePage({ name: "<img onerror=x>", origin: "https://evil.example" }, "</script><b>"));
  assert.doesNotMatch(page, /<img|<\/script><b>/);
});

test("Personal hides the menu items that open This computer", () => {
  const words = { "place.local": "This computer", "native.menu.connect": "Connect to a server…" };
  const t = key => words[key] ?? key;
  const item = (label, id, submenu) => ({ label, id, visible: true, ...(submenu ? { submenu: { items: submenu } } : {}) });
  const menu = { items: [item("OpenMausBot Personal"), item("Server", undefined, [
    item("This computer"), item("bb-1"), item("Connect to a server…"), item("Add Server from Copied Pairing Link…"),
    item("This computer", "workspace-local"), item("Work", "workspace-local-2"), item("New", "workspace-new-local"), item("Connect to a server…", "workspace-connect"),
  ])] };
  const shown = m => m.items.flatMap(i => (i.visible ? [i.label, ...(i.submenu ? shown(i.submenu) : [])] : []));
  assert.deepEqual(shown(personalMenu(official, structuredClone(menu), t)), shown(menu));
  assert.deepEqual(shown(personalMenu(personal, menu, t)), ["OpenMausBot Personal", "Server", "bb-1", "Add Server from Copied Pairing Link…"]);
});

test("Personal cancels every request to a desktop server port", () => {
  let handler;
  blockLocalServer({ webRequest: { onBeforeRequest: fn => { handler = fn; } } });
  const cancelled = url => { let result; handler({ url }, r => { result = r.cancel; }); return result; };
  for (const url of ["http://127.0.0.1:8799/", "http://localhost:18799/api/x", "ws://127.0.0.1:28799/"]) assert.equal(cancelled(url), true, url);
  for (const url of ["https://bb-1.example:8445/", "http://127.0.0.1:5199/"]) assert.equal(cancelled(url), false, url);
});
