import { discover, WAIVERS } from "./discover.ts";
import { ArdError } from "./errors.ts";
import { fetchText, parseJsonOrThrow } from "./http.ts";
import { renderDiscovery, renderTools } from "./render.ts";
import { SiteRegistry } from "./registry.ts";
import { McpHttpClient } from "./mcp-http-client.ts";
import type { RemoteTool, SiteRecord, Waiver } from "./types.ts";

/**
 * The five tools a host sees. Host-agnostic on purpose: the stdio server is a thin shell
 * around this, and the tests drive these handlers directly.
 *
 * Two rules hold everything else up:
 *  1. No tool accepts an endpoint. Endpoints come only from a catalog that passed the
 *     trust checks — otherwise this is a "POST anywhere" primitive wearing a nice name.
 *  2. ard_call forwards only names the remote actually advertised, and returns the
 *     remote's errors verbatim. It never retries elsewhere and never invents a result.
 */

export interface ToolContext {
  registry: SiteRegistry;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const text = (s: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: s }],
  ...(isError ? { isError: true } : {})
});

const ALLOW_PROP = {
  allow: {
    type: "array",
    items: { type: "string", enum: WAIVERS },
    description:
      "Waive a failed trust check for this site. Only pass one after telling the user in plain words what it waives and why the check failed."
  }
} as const;

export const TOOL_DEFS = [
  {
    name: "ard_discover",
    description:
      "Discover an ARD-enabled site from a bare domain. Fetches /.well-known/ai-catalog.json (falling back to llms.txt), validates it, checks the publisher against the host that served it, and reports the capabilities. Call this before any other ard_ tool. Do NOT pass an MCP endpoint — finding that is what this does.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "A bare domain (example.com), an origin, or any URL on the site." },
        refresh: { type: "boolean", description: "Re-fetch even if already discovered this session." },
        ...ALLOW_PROP
      },
      required: ["domain"]
    }
  },
  {
    name: "ard_tools",
    description:
      "List the tools a discovered site actually offers right now, and flag any difference from what its catalog advertised.",
    inputSchema: {
      type: "object",
      properties: { domain: { type: "string" }, ...ALLOW_PROP },
      required: ["domain"]
    }
  },
  {
    name: "ard_call",
    description:
      "Call one tool on a discovered site. Only tools the site currently offers can be called. Results come back verbatim with a provenance line naming the origin and bundle hash — cite concept ids from the result.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string" },
        tool: { type: "string" },
        arguments: { type: "object", description: "Arguments matching that tool's own inputSchema (see ard_tools)." },
        ...ALLOW_PROP
      },
      required: ["domain", "tool"]
    }
  },
  {
    name: "ard_read",
    description:
      "Read the raw source documents a site publishes through its knowledge-bundle capability. With no path, lists what is available; with a path, returns that document.",
    inputSchema: {
      type: "object",
      properties: { domain: { type: "string" }, path: { type: "string" }, ...ALLOW_PROP },
      required: ["domain"]
    }
  },
  {
    name: "ard_sites",
    description: "List the sites discovered in this session, with their publisher, trust level and bundle hash.",
    inputSchema: { type: "object", properties: {} }
  }
] as const;

async function site(ctx: ToolContext, domain: string, refresh = false, allow?: Waiver[]): Promise<SiteRecord> {
  const existing = refresh ? undefined : ctx.registry.find(domain);
  if (existing) return existing;
  const found = await discover(domain, { fetchImpl: ctx.fetchImpl, timeoutMs: ctx.timeoutMs, allow });
  return ctx.registry.put(found);
}

function connect(ctx: ToolContext, rec: SiteRecord) {
  if (!rec.endpoint) {
    throw new ArdError("ARD_NO_CAPABILITY", `${rec.origin} publishes no mcp-server capability.`);
  }
  return ctx.registry.client(rec, {
    fetchImpl: ctx.fetchImpl,
    timeoutMs: ctx.timeoutMs,
    // Read, never re-derived. See DiscoveryResult.allowPrivate.
    allowPrivate: rec.discovery.allowPrivate,
    clientName: "triplane-ard"
  });
}

/**
 * Run something against the site's MCP endpoint, retrying once on a transport failure with a
 * fresh client. A stateless server that has forgotten a session id would otherwise leave the
 * cached client permanently broken with no way back.
 */
async function withClient<T>(ctx: ToolContext, rec: SiteRecord, fn: (c: McpHttpClient) => Promise<T>): Promise<T> {
  const client = connect(ctx, rec);
  try {
    if (!client.protocolVersion) await client.initialize();
    return await fn(client);
  } catch (e) {
    if (!(e instanceof ArdError) || e.code !== "ARD_RPC_FAILED") throw e;
    ctx.registry.dropClient(rec);
    const fresh = connect(ctx, rec);
    await fresh.initialize();
    return fn(fresh);
  }
}

async function liveTools(ctx: ToolContext, rec: SiteRecord): Promise<RemoteTool[]> {
  const cached = ctx.registry.freshTools(rec);
  if (cached) return cached;
  const tools = await withClient(ctx, rec, (c) => c.listTools());
  ctx.registry.cacheTools(rec, tools);
  return tools;
}

export async function runTool(name: string, args: any, ctx: ToolContext): Promise<ToolResult> {
  try {
    switch (name) {
      case "ard_discover": {
        const rec = await site(ctx, String(args?.domain ?? ""), Boolean(args?.refresh), args?.allow);
        return text(renderDiscovery(rec.discovery));
      }

      case "ard_tools": {
        const rec = await site(ctx, String(args?.domain ?? ""), false, args?.allow);
        const tools = await liveTools(ctx, rec);
        return text(renderTools(rec.origin, tools, rec.discovery.capabilities.mcp?.tools));
      }

      case "ard_call": {
        const rec = await site(ctx, String(args?.domain ?? ""), false, args?.allow);
        const tool = String(args?.tool ?? "");
        const tools = await liveTools(ctx, rec);
        if (!tools.some((t) => t.name === tool)) {
          // The second, independent gate. The server already refuses these; so do we, so a
          // proxy can never be the way around a publisher's own exposure decision.
          throw new ArdError("ARD_TOOL_NOT_OFFERED", `${rec.origin} does not offer "${tool}".`, {
            offered: tools.map((t) => t.name)
          });
        }
        const out: any = await withClient(ctx, rec, (c) => c.callTool(tool, args?.arguments ?? {}));
        const body = Array.isArray(out?.content)
          ? out.content.map((c: any) => (c?.type === "text" ? c.text : JSON.stringify(c))).join("\n")
          : JSON.stringify(out, null, 2);
        const hash = rec.discovery.catalog.bundleHash ?? "?";
        return text(`${body}\n\n— via ${rec.endpoint} · bundle ${hash}`);
      }

      case "ard_read": {
        const rec = await site(ctx, String(args?.domain ?? ""), false, args?.allow);
        const cap = rec.discovery.capabilities.bundle;
        if (!cap?.endpoint) {
          throw new ArdError("ARD_NO_CAPABILITY", `${rec.origin} publishes no knowledge-bundle capability.`);
        }
        const path = args?.path ? String(args.path) : "";
        if (path && (path.includes("..") || path.startsWith("/"))) {
          throw new ArdError("ARD_BAD_INPUT", "path must stay inside the bundle");
        }
        const url = path ? `${cap.endpoint}?path=${encodeURIComponent(path)}` : cap.endpoint;
        const res = await fetchText(url, {
          fetchImpl: ctx.fetchImpl,
          timeoutMs: ctx.timeoutMs,
          allowPrivate: rec.discovery.allowPrivate,
          accept: path ? "text/markdown, text/plain" : "application/json"
        });
        if (res.status >= 400) {
          throw new ArdError("ARD_RPC_FAILED", `${url} → HTTP ${res.status}`, res.text.slice(0, 200));
        }
        const body = path ? res.text : JSON.stringify(parseJsonOrThrow(url, res.text), null, 2);
        return text(`${body}\n\n— via ${cap.endpoint} · bundle ${rec.discovery.catalog.bundleHash ?? "?"}`);
      }

      case "ard_sites": {
        const all = ctx.registry.all();
        if (!all.length) return text("No sites discovered yet this session. Start with ard_discover.");
        const rows = all.map((r) => {
          const c = r.discovery.catalog;
          return `${r.origin}\n  publisher ${c.publisher?.name ?? "?"} · trust ${r.discovery.trust.level} · bundle ${c.bundleHash ?? "?"}${r.tools ? ` · ${r.tools.length} tools` : ""}`;
        });
        return text(rows.join("\n"));
      }

      default:
        throw new ArdError("ARD_BAD_INPUT", `Unknown tool: ${name}`);
    }
  } catch (e) {
    // Every failure is an answer the model should read and act on, not a protocol fault.
    if (e instanceof ArdError) return text(e.toText(), true);
    return text(`ARD_UNREACHABLE: ${(e as any)?.message ?? String(e)}`, true);
  }
}
