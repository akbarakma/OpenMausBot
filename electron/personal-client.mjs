import { DESKTOP_PORTS } from "./desktop-ports.mjs";
import { PERSONAL_APP_NAME } from "./personal-ui.mjs";
import { targetsServer } from "./server-session.mjs";

export const personalClient = app => app.isPackaged && app.getName() === PERSONAL_APP_NAME;

const localServer = url => DESKTOP_PORTS.some(port => targetsServer(url, port));

/** The official app can own these ports, so without this a Personal window could open its server instead. */
export function blockLocalServer(session) {
  session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: localServer(details.url) }));
}

function hideLocalItems(menu, labels) {
  for (const item of menu.items) {
    if (labels.has(item.label) || item.id?.startsWith("workspace-local") || item.id === "workspace-new-local") item.visible = false;
    if (item.submenu) hideLocalItems(item.submenu, labels);
  }
  return menu;
}

/** The Server menu's This computer and Connect items carry no id, so they are matched by their label in `t`'s language. */
export const personalMenu = (app, menu, t) => (personalClient(app) ? hideLocalItems(menu, new Set([t("place.local"), t("native.menu.connect")])) : menu);

const html = value => String(value).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

function page(title, body) {
  return "data:text/html;charset=utf-8," + encodeURIComponent(`<!doctype html><html lang="en"><meta name="color-scheme" content="light dark"><title>${html(title)}</title>
<style>
body{margin:0;display:grid;place-items:center;height:100vh;font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;background:#fafafa;color:#18181b}
main{max-width:400px;padding:32px;text-align:center}h1{margin:0 0 8px;font-size:18px;font-weight:500}p{margin:0 0 16px;color:#52525b}
small{display:block;margin-bottom:20px;color:#71717a;font:12px ui-monospace,monospace}
button{min-height:40px;padding:0 16px;border:0;border-radius:8px;background:#18181b;color:#fafafa;font:inherit;font-weight:500;cursor:pointer}button:hover{background:#3f3f46}
@media (prefers-color-scheme:dark){body{background:#121212;color:#f4f4f5}p{color:#a1a1aa}button{background:#f4f4f5;color:#18181b}button:hover{background:#d4d4d8}}
</style><main><h1>${html(title)}</h1>${body}</main></html>`);
}

export function noServerPage() {
  return page("No server saved", "<p>Copy a pairing link from your server, then choose Add Server from Copied Pairing Link in the Server menu.</p>");
}

export function unreachablePage(server, reason) {
  const target = JSON.stringify(`${server.origin}/`).replaceAll("<", "\\u003c");
  return page(`Can't reach ${server.name}`, `<p>This window tries again every 10 seconds and opens ${html(server.name)} when it answers.</p>
<small>${html(reason)} · ${html(new URL(server.origin).host)}</small><button id="retry">Try now</button>
<script>
const target = ${target};
let probing = false;
async function probe() {
  if (probing) return;
  probing = true;
  try { await fetch(target, { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(8000) }); location.replace(target); } catch { probing = false; }
}
document.getElementById("retry").onclick = () => location.replace(target);
setInterval(probe, 10000);
addEventListener("online", probe);
</script>`);
}

/** `id`: the saved server the window must have active before it loads `url`. Null leaves the failure alone. */
export function personalFallback({ failedUrl, reason, state }) {
  const servers = state.environments.filter(entry => entry.kind !== "local" && entry.origin);
  const server = servers.find(entry => entry.id === state.activeId) ?? servers[0];
  if (!server) return localServer(failedUrl) ? { id: null, url: noServerPage() } : null;
  let origin = null;
  try { origin = new URL(failedUrl).origin; } catch {}
  if (origin === server.origin) return { id: server.id, url: unreachablePage(server, reason) };
  return localServer(failedUrl) ? { id: server.id, url: server.origin } : null;
}

export function personalPageFailed({ win, failedUrl, reason, state, activate }) {
  const next = personalFallback({ failedUrl, reason, state });
  if (!next) return;
  if (next.id && next.id !== state.activeId) activate(next.id);
  void win.loadURL(next.url).catch(() => {});
}
