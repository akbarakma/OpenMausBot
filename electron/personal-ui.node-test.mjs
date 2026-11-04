import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { bundledFile, PERSONAL_PAGES } from "./personal-ui.mjs";

const origin = "https://bots.example";
const html = [{ name: "Content-Type", value: "text/html" }];

function bundle(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "personal-ui-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, "assets"));
  for (const name of ["index.html", "rail.html", "app-icon.svg", "assets/index-abc.js"]) writeFileSync(path.join(dir, name), name);
  return dir;
}
const request = (url, resourceType, extra = {}) => ({ request: { url: `${origin}${url}`, method: "GET" }, resourceType, ...extra });
const page = (url, status = 200, responseHeaders = html) => request(url, "Document", { responseStatusCode: status, responseHeaders });

test("Pages the server answers with its UI come from the bundle", t => {
  const dir = bundle(t);
  assert.equal(bundledFile(dir, origin, page("/")), path.join(dir, "index.html"));
  assert.equal(bundledFile(dir, origin, page("/rail")), path.join(dir, "rail.html"));
  assert.equal(bundledFile(dir, origin, page("/pair?code=1")), path.join(dir, "index.html"));
});

test("Bundled files replace the server's copies, and files the bundle lacks still load from the server", t => {
  const dir = bundle(t);
  assert.equal(bundledFile(dir, origin, request("/assets/index-abc.js", "Script")), path.join(dir, "assets/index-abc.js"));
  assert.equal(bundledFile(dir, origin, request("/app-icon.svg", "Image")), path.join(dir, "app-icon.svg"));
  assert.equal(bundledFile(dir, origin, request("/assets/index-old.js", "Script")), null);
  assert.equal(bundledFile(dir, origin, request("/../../etc/passwd", "Other")), null);
});

test("API routes, other origins, writes and non-HTML pages stay with the server", t => {
  const dir = bundle(t);
  assert.equal(bundledFile(dir, origin, request("/api/files/index.html", "Image")), null);
  assert.equal(bundledFile(dir, origin, page("/api/brand")), null);
  assert.equal(bundledFile(dir, origin, page("/.well-known/openmausbot/environment")), null);
  assert.equal(bundledFile(dir, "https://other.example", page("/")), null);
  assert.equal(bundledFile(dir, null, page("/")), null);
  assert.equal(bundledFile(dir, origin, { ...request("/assets/index-abc.js", "Other"), request: { url: `${origin}/assets/index-abc.js`, method: "POST" } }), null);
  assert.equal(bundledFile(dir, origin, page("/mcp-oauth/callback", 200, [{ name: "content-type", value: "text/plain; charset=utf-8" }])), null);
  assert.equal(bundledFile(dir, origin, page("/", 302, [])), null);
  assert.equal(bundledFile(dir, origin, page("/", 401, html)), null);
});

test("The bundle's pages match the server's static pages", () => {
  const source = readFileSync(new URL("../server/static-files.ts", import.meta.url), "utf8");
  const pages = /const PAGES[^=]*=\s*(\{[^}]*\})/.exec(source)?.[1];
  assert.ok(pages, "server/static-files.ts no longer declares PAGES");
  assert.deepEqual(JSON.parse(pages.replace(/\s/g, "")), PERSONAL_PAGES);
});
