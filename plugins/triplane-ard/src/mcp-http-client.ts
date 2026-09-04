import { ArdError } from "./errors.ts";
import { fetchText } from "./http.ts";
import type { RemoteTool } from "./types.ts";

/**
 * A Streamable HTTP MCP client, written to the tolerant half of the spec.
 *
 * Two things the hand-rolled client in ard-agent.ts got wrong and this does not:
 * a JSON-RPC error arrives as HTTP 200, so a naive `.result` read crashes on the one case
 * you most need to report; and a compliant server may answer a POST with either
 * `application/json` or a `text/event-stream` frame, so a client that only parses JSON
 * fails against half the ecosystem.
 *
 * It never opens the optional GET stream. A server answering 405 there is exercising a
 * choice the spec grants it.
 */

const PROTOCOL_VERSION = "2025-06-18";

export interface McpClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  allowPrivate?: boolean;
  clientName?: string;
}

export class McpHttpClient {
  readonly endpoint: string;
  private id = 0;
  private sessionId?: string;
  private negotiated?: string;
  private readonly opts: McpClientOptions;

  constructor(endpoint: string, opts: McpClientOptions = {}) {
    this.endpoint = endpoint;
    this.opts = opts;
  }

  get protocolVersion(): string | undefined {
    return this.negotiated;
  }

  async initialize(): Promise<Record<string, unknown>> {
    const result = await this.rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: this.opts.clientName ?? "triplane-ard", version: "0.1.0" }
    });
    this.negotiated = (result as any)?.protocolVersion ?? PROTOCOL_VERSION;
    // Fire-and-forget per the spec: a notification has no id and expects no result.
    await this.notify("notifications/initialized");
    return result as Record<string, unknown>;
  }

  async listTools(): Promise<RemoteTool[]> {
    const result = (await this.rpc("tools/list", {})) as any;
    const tools = result?.tools;
    if (!Array.isArray(tools)) {
      throw new ArdError("ARD_RPC_FAILED", `${this.endpoint} returned no tools array from tools/list.`);
    }
    return tools as RemoteTool[];
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    return this.rpc("tools/call", { name, arguments: args ?? {} });
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      // Both shapes are legal answers to a POST; say so rather than assuming JSON.
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": this.negotiated ?? PROTOCOL_VERSION,
      ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {})
    };
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const res = await fetchText(this.endpoint, {
      fetchImpl: this.opts.fetchImpl,
      timeoutMs: this.opts.timeoutMs,
      allowPrivate: this.opts.allowPrivate,
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) })
    });
    // 202 with an empty body is the correct answer to a notification; anything 2xx is fine.
    if (res.status >= 400) {
      throw new ArdError("ARD_RPC_FAILED", `${method} → HTTP ${res.status}`, res.text.slice(0, 200));
    }
  }

  private async rpc(method: string, params: unknown): Promise<unknown> {
    const id = ++this.id;
    const res = await fetchText(this.endpoint, {
      fetchImpl: this.opts.fetchImpl,
      timeoutMs: this.opts.timeoutMs,
      allowPrivate: this.opts.allowPrivate,
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
    });

    const session = res.headers.get("mcp-session-id");
    if (session) this.sessionId = session;

    if (res.status >= 400) {
      throw new ArdError("ARD_RPC_FAILED", `${method} → HTTP ${res.status}`, res.text.slice(0, 200));
    }

    const payload = extractJsonRpc(res.text, res.contentType);
    if (payload === null) {
      throw new ArdError("ARD_RPC_FAILED", `${method} → empty response body.`);
    }
    if (payload.error) {
      const e = payload.error as { code?: number; message?: string; data?: unknown };
      throw new ArdError("ARD_TOOL_ERROR", `${method}: ${e.message ?? "remote error"}`, {
        code: e.code,
        data: e.data
      });
    }
    if (!("result" in payload)) {
      throw new ArdError("ARD_RPC_FAILED", `${method} → response had neither result nor error.`);
    }
    return payload.result;
  }
}

/**
 * Accept both response shapes. An SSE frame is `event:`/`data:` lines; the JSON-RPC message
 * rides on the last `data:` payload that parses.
 */
export function extractJsonRpc(text: string, contentType: string): any | null {
  const body = text.trim();
  if (!body) return null;

  if (/text\/event-stream/i.test(contentType) || /^(event|data):/m.test(body)) {
    const datas = [...body.matchAll(/^data:[ \t]?(.*)$/gm)].map((m) => m[1]);
    for (let i = datas.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(datas[i]);
      } catch {
        /* keep looking — a stream may carry comments or partial frames */
      }
    }
    return null;
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new ArdError("ARD_RPC_FAILED", "Response was neither JSON nor an SSE frame.", body.slice(0, 120));
  }
}
