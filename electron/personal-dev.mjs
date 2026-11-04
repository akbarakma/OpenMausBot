import { app, BrowserWindow, ipcMain, Menu, nativeTheme, screen, session, shell } from "electron";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer, loadConfigFromFile } from "vite";
import { createDesktopPrefs, jsonFile, registerDesktopPrefs } from "./desktop-prefs.mjs";
import { personalDevOptions, personalServerOrigin, personalSessionCookies, personalSetup } from "./personal-dev-config.mjs";
import { createPersonalDevProxy, PERSONAL_DEV_HEADER } from "./personal-dev-proxy.mjs";
import { TRAFFIC_LIGHTS, windowBackground, windowChromeOptions } from "./window-chrome.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const { desktopCapabilities } = require("./capabilities.cjs");
const { resolveWindowState } = require("./window-state.cjs");
const values = personalDevOptions(process.argv.slice(2));
const port = values.port;
const profile = values.profile ?? path.join(app.getPath("appData"), "OpenMausBot Personal Dev");
mkdirSync(profile, { recursive: true, mode: 0o700 });
app.setName("OpenMausBot Personal Dev");
app.setPath("userData", profile);
app.setPath("sessionData", profile);
if (!app.requestSingleInstanceLock()) app.exit(0);

const preferencesFile = path.join(profile, "desktop-prefs.json");
let setup;
let preferences;
const capability = randomBytes(32).toString("base64url");
const uiOrigin = `http://127.0.0.1:${port}`;
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
let window;
let authWindow;
let vite;
let proxy;
let quitting = false;
let exitCode = 0;

const trusted = event => event.sender === window?.webContents && event.senderFrame === window.webContents.mainFrame
  && new URL(event.senderFrame.url).origin === uiOrigin;
const handle = (name, handler) => ipcMain.handle(name, (event, ...args) => {
  if (!trusted(event)) throw new Error("This action belongs to the Personal development window.");
  return handler(...args);
});
const capabilities = () => desktopCapabilities({ remote: true, platform: process.platform, frame: preferences.windowFrame() });
const external = value => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Only HTTPS links can open outside the development app.");
  return shell.openExternal(url.href);
};
const signIn = () => {
  if (authWindow && !authWindow.isDestroyed()) { authWindow.focus(); return; }
  authWindow = new BrowserWindow({ width: 700, height: 700, title: `Sign in to ${setup.name}`, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  authWindow.webContents.on("will-navigate", (event, target) => { if (new URL(target).origin !== setup.origin) event.preventDefault(); });
  authWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  authWindow.once("closed", () => { authWindow = null; window?.reload(); });
  void authWindow.loadURL(setup.origin);
};
const serverMenu = () => Menu.buildFromTemplate([
  { label: setup.name, enabled: false },
  { label: "Sign in to server…", click: signIn },
]).popup({ window });

app.whenReady().then(async () => {
  setup = values.fixture
    ? { origin: personalServerOrigin(values.server, true), name: "Fixture", preferences: { analytics: false }, color: "blue" }
    : personalSetup(app.getPath("appData"), values.server ?? process.env.OMB_PERSONAL_SERVER);
  if (!existsSync(preferencesFile)) writeFileSync(preferencesFile, JSON.stringify(setup.preferences), { mode: 0o600, flag: "wx" });
  preferences = createDesktopPrefs(jsonFile(preferencesFile));
  const browserSession = session.defaultSession;
  if (!values.fixture) {
    const existing = await browserSession.cookies.get({ url: setup.origin });
    if (!existing.some(cookie => cookie.name.startsWith("omb_session_"))) {
      for (const cookie of personalSessionCookies(setup.source, setup.origin)) await browserSession.cookies.set(cookie);
      await browserSession.cookies.flushStore();
    }
  } else {
    await browserSession.cookies.set({ url: setup.origin, name: "omb_session_fixture", value: "fixture-session", httpOnly: true });
  }
  const cookies = async url => (await browserSession.cookies.get({ url })).filter(cookie => cookie.name.startsWith("omb_session_"))
    .map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
  proxy = createPersonalDevProxy({ origin: setup.origin, capability, cookies });
  const config = values.fixture ? {} : (await loadConfigFromFile({ command: "serve", mode: "development" }, path.join(root, "vite.config.ts"))).config;
  vite = await createServer({
    ...config, root: values.fixture ? realpathSync(values.fixture) : root, configFile: false,
    plugins: [...(config.plugins ?? []), proxy.plugin], clearScreen: false,
    server: { ...config.server, host: "127.0.0.1", port, strictPort: true, proxy: {} },
  });
  await vite.listen();

  const stateFile = path.join(profile, "window-state.json");
  let savedWindow;
  try { savedWindow = JSON.parse(readFileSync(stateFile, "utf8")); } catch {}
  const state = resolveWindowState(savedWindow, screen.getAllDisplays().map(display => display.workArea));
  window = new BrowserWindow({
    ...state.bounds, minWidth: 840, minHeight: 620,
    title: `OpenMausBot Personal Dev · ${setup.name}`,
    backgroundColor: windowBackground(nativeTheme.shouldUseDarkColors),
    ...windowChromeOptions(process.platform, preferences.windowFrame()),
    webPreferences: {
      preload: path.join(root, "electron/personal-dev-preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false,
      additionalArguments: [`--personal-origin=${uiOrigin}`, `--personal-version=${version}`],
    },
  });
  const contentsId = window.webContents.id;
  browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const url = new URL(details.url);
    const own = details.webContentsId === contentsId && url.host === new URL(uiOrigin).host && ["http:", "ws:"].includes(url.protocol);
    callback({ requestHeaders: own ? { ...details.requestHeaders, [PERSONAL_DEV_HEADER]: capability } : details.requestHeaders });
  });
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
  window.webContents.on("will-navigate", (event, url) => { if (new URL(url).origin !== uiOrigin) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(({ url }) => { void external(url).catch(() => {}); return { action: "deny" }; });
  window.on("page-title-updated", event => event.preventDefault());
  registerDesktopPrefs({
    ipcMain, prefs: preferences, page: event => trusted(event) ? "local" : null, cloudOffered: async () => false,
    languageChanged: language => window.webContents.send("desktop-language:changed", language),
    frame: { made: () => preferences.windowFrame(), restarts: false, changed: () => {
      if (process.platform === "darwin") window.setTrafficLightPosition(preferences.windowFrame() ? TRAFFIC_LIGHTS.framed : TRAFFIC_LIGHTS.unframed);
      window.webContents.send("desktop:capabilities-changed", capabilities());
    } },
  });
  handle("desktop:capabilities", capabilities);
  handle("personal:workspace", () => ({ local: false, name: setup.name, origin: setup.origin, color: setup.color }));
  handle("personal:server-menu", serverMenu);
  handle("personal:external", external);
  handle("desktop:skin", () => {});
  handle("desktop:unread", count => { if (Number.isSafeInteger(count) && count >= 0) app.setBadgeCount(count); });
  handle("window:minimize", () => window.minimize());
  handle("window:toggle-maximize", () => window.isMaximized() ? window.unmaximize() : window.maximize());
  handle("window:state", () => ({ maximized: window.isMaximized() }));
  handle("window:close", () => window.close());
  for (const name of ["maximize", "unmaximize"]) window.on(name, () => window.webContents.send("window:maximized-changed", window.isMaximized()));
  window.on("close", () => writeFileSync(stateFile, JSON.stringify({ bounds: window.getBounds(), maximized: window.isMaximized() }), { mode: 0o600 }));
  if (state.maximized) window.maximize();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: "appMenu", label: "Personal Dev" }, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" },
    { label: "Server", submenu: [{ label: setup.name, enabled: false }, { label: "Sign in…", click: signIn }] },
  ]));
  if (values.verify) {
    window.webContents.on("did-finish-load", async () => {
      const result = await window.webContents.executeJavaScript(`(async () => ({
        origin: location.origin, apiStatus: (await fetch('/api/health')).status,
        sessionStatus: (await fetch('/api/auth/session')).status,
        configStatus: (await fetch('/api/config')).status,
        isolated: typeof window.require === 'undefined' && !window.ogb?.companion && !window.ogb?.computerSharing,
        localControl: (await window.ogb.getCapabilities()).localComputer.available,
        hot: Boolean(document.querySelector('script[src="/@vite/client"]')),
        localSource: [...document.scripts].some(script => new URL(script.src || location.href).pathname.startsWith('/src/'))
      }))()`);
      process.stdout.write(`${JSON.stringify({ type: "personal-dev-verified", ...result })}\n`);
    });
  }
  await window.loadURL(uiOrigin);
  process.stdout.write(`${JSON.stringify({ type: "personal-dev-ready", pid: process.pid, url: uiOrigin, server: setup.origin, profile })}\n`);
}).catch(error => { exitCode = 1; process.stderr.write(`Personal development failed: ${error.message}\n`); app.quit(); });

app.on("window-all-closed", () => app.quit());
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => app.quit());
app.on("before-quit", event => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  proxy?.close();
  void Promise.resolve(vite?.close()).finally(() => exitCode ? app.exit(exitCode) : app.quit());
});
