const { contextBridge, ipcRenderer } = require("electron");

const origin = process.argv.find(value => value.startsWith("--personal-origin="))?.slice("--personal-origin=".length);
const version = process.argv.find(value => value.startsWith("--personal-version="))?.slice("--personal-version=".length) ?? "dev";
const subscribe = (channel, listener) => {
  const handler = (_event, value) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

if (location.origin === origin) {
  contextBridge.exposeInMainWorld("ogb", {
    platform: process.platform,
    app: { version, ownPage: false },
    getCapabilities: () => ipcRenderer.invoke("desktop:capabilities"),
    onCapabilitiesChanged: listener => subscribe("desktop:capabilities-changed", listener),
    applySkin: skin => ipcRenderer.invoke("desktop:skin", skin),
    setUnreadCount: count => ipcRenderer.invoke("desktop:unread", count),
    openExternal: url => ipcRenderer.invoke("personal:external", url),
    workspaces: {
      state: () => ipcRenderer.invoke("personal:workspace"),
      menu: () => ipcRenderer.invoke("personal:server-menu"),
      onChanged: listener => subscribe("workspaces:changed", listener),
    },
    desktopAnalytics: {
      enabled: () => ipcRenderer.sendSync("desktop-analytics:read"),
      set: enabled => ipcRenderer.invoke("desktop-analytics:set", enabled === true),
    },
    desktopLanguage: {
      choice: () => ipcRenderer.sendSync("desktop-language:read"),
      set: language => ipcRenderer.invoke("desktop-language:set", language),
      onChange: listener => subscribe("desktop-language:changed", listener),
    },
    desktopNotices: {
      state: () => ipcRenderer.invoke("desktop-notices:state"),
      seen: id => ipcRenderer.invoke("desktop-notices:seen", id),
      shown: () => Promise.resolve(false),
    },
    windowFrame: {
      state: () => ipcRenderer.invoke("window-frame:state"),
      set: enabled => ipcRenderer.invoke("window-frame:set", enabled === true),
    },
    windowControls: {
      minimize: () => ipcRenderer.invoke("window:minimize"),
      toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
      close: () => ipcRenderer.invoke("window:close"),
      state: () => ipcRenderer.invoke("window:state"),
      onMaximizedChanged: listener => subscribe("window:maximized-changed", listener),
    },
  });
}
