import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { personalDevOptions } from "../electron/personal-dev-config.mjs";

const require = createRequire(import.meta.url);
try { personalDevOptions(process.argv.slice(2)); }
catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [fileURLToPath(new URL("../electron/personal-dev.mjs", import.meta.url)), ...process.argv.slice(2)], {
  env: environment, stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
child.once("error", error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.once("exit", code => { process.exitCode = code ?? 1; });
