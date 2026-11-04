import http from "node:http";
import https from "node:https";
import { WebSocket, WebSocketServer } from "ws";

export const PERSONAL_DEV_HEADER = "x-openmausbot-personal-dev";
const HOP_HEADERS = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);

export function personalApiPath(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  const url = new URL(raw, "http://personal.invalid");
  return url.pathname.startsWith("/api/") || url.pathname === "/.well-known/openmausbot/environment"
    ? `${url.pathname}${url.search}` : null;
}

function requestHeaders(incoming, origin, cookies) {
  const headers = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined && !HOP_HEADERS.has(key) && !["host", "cookie", "authorization", "origin", "referer"].includes(key)
      && !key.startsWith("sec-") && !key.startsWith("x-forwarded-") && !key.startsWith("x-openmausbot-")) headers[key] = value;
  }
  return { ...headers, origin, referer: `${origin}/`, "sec-fetch-site": "same-origin", ...(cookies ? { cookie: cookies } : {}) };
}

export function createPersonalDevProxy({ origin, capability, cookies }) {
  const remote = new URL(origin);
  const transport = remote.protocol === "https:" ? https : http;
  const requests = new Set();
  const sockets = new Set();
  const webSockets = new WebSocketServer({ noServer: true });
  let uiOrigin;

  function allowed(request) {
    return request.headers[PERSONAL_DEV_HEADER] === capability && request.headers.host === new URL(uiOrigin).host
      && (!request.headers.origin || request.headers.origin === uiOrigin);
  }

  function refuse(response, status, message) {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ error: message }));
  }

  async function relay(request, response, route) {
    const header = await cookies(`${origin}${route}`);
    if (request.destroyed || response.destroyed) return;
    const outgoing = transport.request(new URL(route, origin), {
      method: request.method, headers: requestHeaders(request.headers, origin, header),
    }, incoming => {
      outgoing.setTimeout(0);
      const headers = Object.fromEntries(Object.entries(incoming.headers).filter(([key]) => !HOP_HEADERS.has(key) && key !== "set-cookie"));
      response.writeHead(incoming.statusCode ?? 502, headers);
      response.flushHeaders();
      incoming.on("error", () => response.destroy());
      incoming.pipe(response);
    });
    requests.add(outgoing);
    outgoing.once("close", () => requests.delete(outgoing));
    outgoing.setTimeout(15_000, () => outgoing.destroy(new Error("Server connection timed out")));
    outgoing.on("error", () => {
      if (!response.headersSent && !response.destroyed) refuse(response, 502, "The Personal server could not be reached.");
      else response.destroy();
    });
    request.once("aborted", () => outgoing.destroy());
    response.once("close", () => outgoing.destroy());
    request.pipe(outgoing);
  }

  async function upgrade(request, socket, head) {
    const route = personalApiPath(request.url);
    if (!route) return;
    if (!allowed(request)) { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return; }
    try {
      const header = await cookies(`${origin}${route}`);
      if (socket.destroyed) return;
      const target = new URL(route, origin);
      target.protocol = remote.protocol === "https:" ? "wss:" : "ws:";
      const protocols = String(request.headers["sec-websocket-protocol"] ?? "").split(",").map(value => value.trim()).filter(Boolean);
      const upstream = new WebSocket(target, protocols, {
        headers: requestHeaders(request.headers, origin, header), handshakeTimeout: 10_000, followRedirects: false,
      });
      sockets.add(upstream);
      upstream.once("close", () => sockets.delete(upstream));
      socket.once("close", () => upstream.terminate());
      upstream.once("error", () => socket.destroy());
      upstream.once("unexpected-response", () => { upstream.terminate(); socket.destroy(); });
      upstream.once("open", () => {
        webSockets.handleUpgrade(request, socket, head, downstream => {
          sockets.add(downstream);
          downstream.on("message", (data, binary) => { if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary }); });
          upstream.on("message", (data, binary) => { if (downstream.readyState === WebSocket.OPEN) downstream.send(data, { binary }); });
          downstream.once("close", () => { sockets.delete(downstream); upstream.close(); });
          downstream.once("error", () => upstream.terminate());
          upstream.once("close", () => downstream.close());
        });
      });
    } catch { socket.destroy(); }
  }

  return {
    plugin: {
      name: "personal-authenticated-api",
      configureServer(server) {
        uiOrigin = `http://127.0.0.1:${server.config.server.port}`;
        server.middlewares.use((request, response, next) => {
          const route = personalApiPath(request.url);
          if (!route) return next();
          if (!allowed(request)) return refuse(response, 403, "Open this API in the Personal development app.");
          void relay(request, response, route).catch(() => {
            if (!response.destroyed && !response.headersSent) refuse(response, 502, "The Personal connection is unavailable.");
          });
        });
        server.httpServer?.on("upgrade", upgrade);
      },
    },
    close() {
      for (const request of requests) request.destroy();
      for (const socket of sockets) socket.terminate();
      webSockets.close();
    },
  };
}
