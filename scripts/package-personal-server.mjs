import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const built = join(root, "dist-server");
const out = join(root, "release", "npm");
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: "inherit" });
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

if (git("status", "--porcelain")) {
  console.error("commit your changes first: the package records its source commit");
  process.exit(1);
}

const startedAt = Date.now();
run("corepack", ["pnpm", "build:server"]);
run("corepack", ["pnpm", "exec", "vite", "build"]);
run("node", ["scripts/build-npm-package.mjs"]);

// The build never empties dist-server, so a file whose source upstream deleted stays there from an older build.
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
const stale = files(built).filter((file) => statSync(file).mtimeMs < startedAt);
for (const file of stale) rmSync(join(out, "dist-server", relative(built, file)), { force: true });

const manifest = join(out, "package.json");
const commit = git("rev-parse", "--short", "HEAD");
writeFileSync(manifest, `${JSON.stringify({ ...JSON.parse(readFileSync(manifest, "utf8")), personalCommit: commit }, null, 2)}\n`);

const tarball = execFileSync("npm", ["pack", "--silent"], { cwd: out, encoding: "utf8" }).trim();
console.log(`left out ${stale.length} stale files`);
console.log(`personal server package at ${join(out, tarball)} (commit ${commit})`);
