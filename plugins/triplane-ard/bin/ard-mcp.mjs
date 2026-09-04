#!/usr/bin/env node
/**
 * Launcher. Plain ESM so that ANY Node >= 18 can parse this file, including the ones that
 * cannot parse the TypeScript it starts.
 *
 * Order matters: native type stripping (Node >= 22.18) needs no toolchain at all, which is
 * what lets this run from a copied-out plugin directory with no node_modules. `npx` is
 * deliberately not used — it resolves from the user's cwd rather than this package, hits
 * the network on a cold cache, and the delay can exceed a host's MCP startup timeout.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const entry = fileURLToPath(new URL("../src/serve.ts", import.meta.url));

if (process.features.typescript) {
  // src/serve.ts is the one module whose import starts the loop; mcp-stdio.ts stays
  // side-effect free so tests can import handleRpc without becoming a server.
  await import(new URL("../src/serve.ts", import.meta.url).href);
} else {
  const relaunch = (cmd, args) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
    child.on("error", (e) => {
      process.stderr.write(`triplane-ard: could not start ${cmd}: ${e.message}\n`);
      process.exit(1);
    });
  };

  if (process.env.TRIPLANE_ARD_NODE) {
    relaunch(process.env.TRIPLANE_ARD_NODE, [entry]);
  } else {
    let tsx = null;
    try {
      // Resolves from this file upward, so the repo's own devDependency is found without
      // depending on where the host happened to set cwd.
      tsx = createRequire(import.meta.url).resolve("tsx");
    } catch {
      /* not installed nearby */
    }
    if (tsx) {
      // The RESOLVED path, as a file URL. `--import tsx` would resolve the bare specifier
      // against the host's cwd, which is wherever the user happened to be — not this
      // package. That is a real failure: the host reports only "Connection closed".
      relaunch(process.execPath, ["--import", pathToFileURL(tsx).href, entry]);
    } else {
      process.stderr.write(
        `triplane-ard needs Node >= 22.18 for native TypeScript (this is ${process.version}).\n` +
          `Fix it one of two ways:\n` +
          `  - point at a newer Node:  TRIPLANE_ARD_NODE=/path/to/node\n` +
          `  - or run it from a checkout where 'npm install' has been run (it will use tsx)\n`
      );
      process.exit(1);
    }
  }
}
