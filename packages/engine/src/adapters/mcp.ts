import type { Graph, ToolDef } from "../types";

/**
 * Plane 3 transport: minimal stateless MCP-over-HTTP (JSON-RPC) handler.
 * Mount global READ tools only. ui/write tools never leave the browser gate, and
 * page-scoped tools have no page out here — offering them would be a lie the caller
 * only discovers at call time.
 * Framework-agnostic: give it a parsed JSON-RPC body, it returns the response body.
 * TODO(spec): swap for @modelcontextprotocol/sdk StreamableHTTP transport post-hackathon.
 */
export function createMcpHandler(tools: ToolDef[], graph: Graph, serverName: string) {
  const readTools = tools.filter((t) => t.kind === "read" && t.scope === "global");
  return async function handle(rpc: any): Promise<any> {
    const { id, method, params } = rpc ?? {};
    const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
    const err = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

    switch (method) {
      case "initialize":
        return reply({
          protocolVersion: params?.protocolVersion ?? "2025-06-18",
          serverInfo: { name: serverName, version: "0.1.0" },
          capabilities: { tools: {} }
        });
      case "notifications/initialized":
        return null; // notification — no response body
      case "ping":
        return reply({});
      case "tools/list":
        return reply({
          tools: readTools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
        });
      case "tools/call": {
        const t = readTools.find((x) => x.name === params?.name);
        if (!t) return err(-32602, `Unknown tool: ${params?.name}`);
        const result = await t.handler(params?.arguments ?? {}, { graph });
        return reply(result);
      }
      default:
        return err(-32601, `Method not found: ${method}`);
    }
  };
}
