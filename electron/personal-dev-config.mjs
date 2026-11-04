import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

export function personalDevOptions(args) {
  const { values } = parseArgs({ args, options: {
    port: { type: "string", default: "5199" }, server: { type: "string" },
    fixture: { type: "string" }, profile: { type: "string" }, verify: { type: "boolean" },
  } });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Choose a development port between 1024 and 65535.");
  if (values.profile && !values.fixture) throw new Error("Profile overrides are reserved for isolated verification fixtures.");
  return { ...values, port };
}

export function personalServerOrigin(value, fixture = false) {
  const url = new URL(value);
  const local = fixture && url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("The Personal server must be an HTTPS origin without credentials or a path.");
  }
  return url.origin;
}

export function personalSetup(appData, override) {
  const source = path.join(appData, "OpenMausBot Personal");
  const environments = JSON.parse(readFileSync(path.join(source, "environments.json"), "utf8"));
  const selected = environments.environments?.find(entry => entry.id === environments.activeId && entry.kind !== "local");
  if (!override && !selected) throw new Error("Connect the installed Personal app to your server before starting development.");
  const origin = personalServerOrigin(override || selected?.origin);
  const name = override ? new URL(origin).hostname : String(selected.name).slice(0, 80);
  let preferences = {};
  const file = path.join(source, "desktop-prefs.json");
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    for (const key of ["analytics", "language", "railHidden", "windowFrame", "talkShortcut", "talkKey", "seen"]) {
      if (Object.hasOwn(saved, key)) preferences[key] = saved[key];
    }
  }
  return { source, origin, name, color: selected?.color ?? "blue", preferences };
}

export function personalSessionCookies(profile, origin) {
  const file = path.join(profile, "Cookies");
  if (!existsSync(file)) return [];
  const host = new URL(origin).hostname;
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = db.prepare(`
      SELECT name, value, path, is_secure, is_httponly,
             expires_utc = 0 AS session,
             expires_utc / 1000000.0 - 11644473600 AS expiration
      FROM cookies
      WHERE host_key = ? AND name GLOB 'omb_session_*' AND value <> ''
    `).all(host);
    return rows.filter(row => row.session || row.expiration > Date.now() / 1000).map(row => ({
      url: origin, name: row.name, value: row.value, path: row.path,
      secure: Boolean(row.is_secure), httpOnly: Boolean(row.is_httponly),
      ...(!row.session ? { expirationDate: row.expiration } : {}), sameSite: "lax",
    }));
  } finally {
    db.close();
  }
}
