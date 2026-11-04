import { readFileSync, statSync } from "node:fs";
import path from "node:path";

export const PERSONAL_APP_NAME = "OpenMausBot Personal";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

export const PERSONAL_PAGES = { "/": "/index.html", "/rail": "/rail.html" };
const PAGE_HEADERS = [
  { name: "content-security-policy", value: "frame-ancestors 'none'" },
  { name: "x-frame-options", value: "DENY" },
  { name: "referrer-policy", value: "no-referrer" },
];
const SUBRESOURCES = ["Script", "Stylesheet", "Font", "Image", "Media", "Other"];

function bundleFile(dir, pathname) {
  const file = path.join(dir, PERSONAL_PAGES[pathname] ?? pathname);
  if (!file.startsWith(dir + path.sep)) return null;
  try { return statSync(file).isFile() ? file : null; } catch { return null; }
}

/** A page is replaced only after the server answered it with HTML, so redirects, errors and OAuth callbacks stay the server's. */
export function bundledFile(dir, origin, paused) {
  const url = new URL(paused.request.url);
  if (!origin || url.origin !== origin || paused.request.method !== "GET") return null;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.well-known/")) return null;
  if (paused.resourceType !== "Document") return bundleFile(dir, url.pathname);
  const type = paused.responseHeaders?.find(header => header.name.toLowerCase() === "content-type")?.value ?? "";
  if (paused.responseStatusCode !== 200 || !type.startsWith("text/html")) return null;
  return bundleFile(dir, url.pathname) ?? path.join(dir, "index.html");
}

function responseHeaders(file) {
  const type = MIME[path.extname(file)] ?? "application/octet-stream";
  if (type === "text/html") return [{ name: "content-type", value: type }, { name: "cache-control", value: "no-cache" }, ...PAGE_HEADERS];
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  return [{ name: "content-type", value: type }, { name: "cache-control", value: immutable ? "public, max-age=31536000, immutable" : "no-cache" }];
}

/**
 * Electron's protocol.handle("https") would route every request in the session, cookies and uploads included,
 * through a re-fetch. Chromium's Fetch domain pauses only the patterns below; API, EventSource and WebSocket
 * requests never match. Load the server's origin only after this resolves, or the first page skips interception.
 */
export async function attachPersonalUi(contents, { dir, origin, log }) {
  const cdp = contents.debugger;
  const pass = requestId => cdp.sendCommand("Fetch.continueRequest", { requestId }).catch(() => {});
  cdp.on("message", (_event, method, paused) => {
    if (method !== "Fetch.requestPaused") return;
    let file = null;
    try { file = bundledFile(dir, origin(), paused); } catch (error) { log(`personal ui: ${error?.message ?? error}`); }
    if (!file) { void pass(paused.requestId); return; }
    let body;
    try { body = readFileSync(file).toString("base64"); } catch (error) { log(`personal ui: ${error?.message ?? error}`); void pass(paused.requestId); return; }
    void cdp.sendCommand("Fetch.fulfillRequest", { requestId: paused.requestId, responseCode: 200, responseHeaders: responseHeaders(file), body })
      .catch(error => { log(`personal ui: ${error?.message ?? error}`); void pass(paused.requestId); });
  });
  cdp.on("detach", (_event, reason) => log(`personal ui: interception stopped (${reason})`));
  try {
    cdp.attach("1.3");
    await cdp.sendCommand("Fetch.enable", { patterns: [
      { urlPattern: "*", resourceType: "Document", requestStage: "Response" },
      ...SUBRESOURCES.map(resourceType => ({ urlPattern: "*", resourceType, requestStage: "Request" })),
    ] });
  } catch (error) {
    log(`personal ui: interception unavailable, showing the server's UI (${error?.message ?? error})`);
  }
}

/** Null outside the packaged Personal app, so the official app keeps showing the server's UI. */
export function personalWindowUi(app, contents, origin, log) {
  if (!app.isPackaged || app.getName() !== PERSONAL_APP_NAME) return null;
  return attachPersonalUi(contents, { dir: path.join(process.resourcesPath, "ui"), origin, log });
}
