import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PERSONAL_APP_NAME } from "../electron/personal-ui.mjs";

const PERSONAL_APP_ID = "com.akbarakma.openmausbot.personal";
const INSTALLED = `/Applications/${PERSONAL_APP_NAME}.app`;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { values } = parseArgs({ options: { install: { type: "boolean" } } });

const fail = message => { process.stderr.write(`${message}\n`); process.exit(1); };
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const plist = app => JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", path.join(app, "Contents/Info.plist")], { encoding: "utf8" }));
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) fail(`${[command, ...args].join(" ")} failed.`);
};
const pnpm = script => process.env.npm_execpath ? run(process.execPath, [process.env.npm_execpath, "run", script]) : run("pnpm", ["run", script]);
const running = () => spawnSync("pgrep", ["-f", `${INSTALLED}/Contents/MacOS/`]).status === 0;

if (process.platform !== "darwin") fail("Personal packaging builds the macOS app only.");
if (git("status", "--porcelain")) fail("Commit or stash your changes first: the app records the commit it was built from.");
const commit = git("rev-parse", "HEAD");
if (values.install && running()) fail(`Quit ${PERSONAL_APP_NAME} before installing.`);

for (const script of ["build", "build:server", "build:companion"]) pnpm(script);

const speech = [path.join(root, "electron/resources/OpenMausBot Speech.app"), `${INSTALLED}/Contents/Resources/OpenMausBot Speech.app`].find(existsSync);
if (!speech) fail("No speech helper found. Run `corepack pnpm build:speech` once, then package again.");

const builderPath = require.resolve("electron-builder");
const yaml = createRequire(builderPath)("js-yaml");
const config = yaml.load(readFileSync(path.join(root, "electron-builder.yml"), "utf8"));
const output = path.join(root, "release", "personal", commit.slice(0, 9));
Object.assign(config, {
  appId: PERSONAL_APP_ID,
  productName: PERSONAL_APP_NAME,
  publish: null,
  protocols: [],
  extraMetadata: { productName: PERSONAL_APP_NAME },
});
config.directories = { ...config.directories, output };
config.mac = { ...config.mac, identity: null, extendInfo: { ...config.mac.extendInfo,
  LSEnvironment: { MallocNanoZone: "0", OMB_DATA_DIR: path.join(homedir(), "Library/Application Support/OpenMausBot Personal Data"), OMB_WEBHOOK_PORT: "18800" },
  CFBundleURLTypes: [],
  OMBSourceCommit: commit,
} };
config.mac.extraResources = config.mac.extraResources.map(resource => resource.to === "OpenMausBot Speech.app" ? { ...resource, from: speech } : resource);

process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
rmSync(output, { recursive: true, force: true });
const { Arch, build, Platform } = require("electron-builder");
await build({ projectDir: root, config, publish: "never", targets: Platform.MAC.createTarget(["dir"], Arch[process.arch]) });

const built = path.join(output, `mac-${process.arch}`, `${PERSONAL_APP_NAME}.app`);
run("codesign", ["--force", "--deep", "--sign", "-", "--options", "runtime", "--entitlements", path.join(root, "build/entitlements.mac.plist"), built]);
run("codesign", ["--verify", "--deep", "--strict", built]);
const info = plist(built);
if (info.CFBundleIdentifier !== PERSONAL_APP_ID || info.CFBundleName !== PERSONAL_APP_NAME || info.OMBSourceCommit !== commit) fail("The built app has the wrong identity.");
if (existsSync(path.join(built, "Contents/Resources/app-update.yml"))) fail("The built app would auto-update from upstream.");
if (!existsSync(path.join(built, "Contents/Resources/ui/index.html"))) fail("The built app has no bundled UI.");
process.stdout.write(`Built ${built}\n`);
if (!values.install) process.exit(0);

if (running()) fail(`Quit ${PERSONAL_APP_NAME} before installing.`);
const previous = path.join(output, "previous.app");
if (existsSync(INSTALLED)) {
  if (plist(INSTALLED).CFBundleIdentifier !== PERSONAL_APP_ID) fail(`${INSTALLED} is not the Personal app; leaving it alone.`);
  renameSync(INSTALLED, previous);
}
try {
  renameSync(built, INSTALLED);
} catch (error) {
  if (existsSync(previous)) renameSync(previous, INSTALLED);
  throw error;
}
run("codesign", ["--verify", "--deep", "--strict", INSTALLED]);
if (existsSync(previous)) run("/usr/bin/trash", [previous]);
process.stdout.write(`Installed ${INSTALLED} from ${commit.slice(0, 9)}. The previous copy is in the Trash.\n`);
