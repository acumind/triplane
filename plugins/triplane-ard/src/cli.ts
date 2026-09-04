#!/usr/bin/env tsx
import { discover } from "./discover.ts";
import { parseArgv } from "./argv.ts";
import { fetchText } from "./http.ts";
import { McpHttpClient } from "./mcp-http-client.ts";
import { renderDiscovery, renderTools } from "./render.ts";
import { ArdError } from "./errors.ts";
import type { Waiver } from "./types.ts";

/**
 * The library with no host at all.
 *
 * Useful for three things: debugging without restarting an agent, proving the flow when a
 * plugin misbehaves live, and showing that ARD is a protocol rather than a feature of one
 * vendor's tool.
 *
 *   npm run ard -- discover <domain> [--allow offsite-endpoint]
 *   npm run ard -- tools    <domain>
 *   npm run ard -- call     <domain> <tool> '<json args>'
 *   npm run ard -- read     <domain> [path]
 *
 * There is no `sites` command: the CLI is one-shot, so a session registry would always be
 * empty. That tool exists only in the MCP server, and the README says so.
 */

let allow: Waiver[] = [];

async function connect(d: string) {
  const found = await discover(d, { allow });
  const endpoint = found.capabilities.mcp?.endpoint;
  if (!endpoint) {
    throw new ArdError("ARD_NO_CAPABILITY", `${found.origin} publishes no mcp-server capability.`);
  }
  const client = new McpHttpClient(endpoint, {
    allowPrivate: found.allowPrivate,
    clientName: "triplane-ard-cli"
  });
  await client.initialize();
  return { found, client, endpoint };
}

async function main() {
  const parsed = parseArgv(process.argv.slice(2));
  const { cmd, domain, args } = parsed;
  allow = parsed.allow;

  if (!cmd || !domain) {
    console.log("usage: ard <discover|tools|call|read> <domain> [...] [--allow <waiver>]");
    process.exit(2);
  }

  if (cmd === "discover") {
    console.log(renderDiscovery(await discover(domain, { allow })));
    return;
  }

  if (cmd === "tools") {
    const { found, client } = await connect(domain);
    console.log(renderTools(found.origin, await client.listTools(), found.capabilities.mcp?.tools));
    return;
  }

  if (cmd === "call") {
    const [tool, json] = args;
    if (!tool) throw new ArdError("ARD_BAD_INPUT", "call needs a tool name.");
    const { found, client, endpoint } = await connect(domain);

    // The same gate the proxy enforces: only names the remote actually advertises.
    const live = await client.listTools();
    if (!live.some((t) => t.name === tool)) {
      throw new ArdError("ARD_TOOL_NOT_OFFERED", `${found.origin} does not offer "${tool}".`, {
        offered: live.map((t) => t.name)
      });
    }
    const out: any = await client.callTool(tool, json ? JSON.parse(json) : {});
    // Flattened the way the proxy flattens it, so the two front ends show the same thing.
    console.log(
      Array.isArray(out?.content)
        ? out.content.map((c: any) => (c?.type === "text" ? c.text : JSON.stringify(c))).join("\n")
        : JSON.stringify(out, null, 2)
    );
    console.log(`\n— via ${endpoint} · bundle ${found.catalog.bundleHash ?? "?"}`);
    return;
  }

  if (cmd === "read") {
    const [path] = args;
    const found = await discover(domain, { allow });
    const cap = found.capabilities.bundle;
    if (!cap?.endpoint) {
      throw new ArdError("ARD_NO_CAPABILITY", `${found.origin} publishes no knowledge-bundle capability.`);
    }
    if (path && (path.includes("..") || path.startsWith("/"))) {
      throw new ArdError("ARD_BAD_INPUT", "path must stay inside the bundle");
    }
    const url = path ? `${cap.endpoint}?path=${encodeURIComponent(path)}` : cap.endpoint;
    const res = await fetchText(url, {
      allowPrivate: found.allowPrivate,
      accept: path ? "text/markdown, text/plain" : "application/json"
    });
    if (res.status >= 400) throw new ArdError("ARD_RPC_FAILED", `${url} → HTTP ${res.status}`, res.text.slice(0, 200));
    console.log(res.text);
    console.log(`\n— via ${cap.endpoint} · bundle ${found.catalog.bundleHash ?? "?"}`);
    return;
  }

  throw new ArdError("ARD_BAD_INPUT", `Unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e instanceof ArdError ? e.toText() : `✗ ${e?.message ?? e}`);
  process.exit(1);
});
