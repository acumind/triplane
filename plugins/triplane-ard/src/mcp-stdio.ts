import { encodeLine, LineDecoder } from "./stdio-codec.ts";
import { runTool, TOOL_DEFS, type ToolContext } from "./proxy-tools.ts";
import { SiteRegistry } from "./registry.ts";

/**
 * The MCP server the host launches.
 *
 * This is the ONLY file permitted to write to stdout, and only through encodeLine — one
 * stray console.log corrupts the JSON-RPC stream and the host reports nothing more useful
 * than "server disconnected". Diagnostics go to stderr.
 */

const SUPPORTED = ["2025-06-18", "2025-03-26"];
const VERSION = "0.1.0";

const ok = (id: unknown, result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
const err = (id: unknown, code: number, message: string) => ({
  jsonrpc: "2.0" as const,
  id,
  error: { code, message }
});

export function handleRpc(msg: any, ctx: ToolContext): Promise<object | null> | object | null {
  // A notification has no id and gets no reply — answering one is a protocol violation.
  const isNotification = msg?.id === undefined || msg?.id === null;
  const { id, method, params } = msg ?? {};

  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      return ok(id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        serverInfo: { name: "triplane-ard", version: VERSION },
        capabilities: { tools: {} },
        instructions:
          "Agentic Resource Discovery. Given a bare domain, call ard_discover first — it finds the site's catalog, checks the publisher against the host that served it, and reports what that does and does not prove. Then ard_tools to see what is offered, and ard_call to use it. Cite concept ids from results."
      });
    }

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, { tools: TOOL_DEFS });

    case "tools/call": {
      const name = params?.name;
      if (!TOOL_DEFS.some((t) => t.name === name)) {
        return err(id, -32602, `Unknown tool: ${name}`);
      }
      return runTool(name, params?.arguments ?? {}, ctx).then((result) => ok(id, result));
    }

    default:
      return isNotification ? null : err(id, -32601, `Method not found: ${method}`);
  }
}

export function serve(ctx: ToolContext = { registry: new SiteRegistry() }): void {
  const decoder = new LineDecoder();
  const write = (msg: unknown) => process.stdout.write(encodeLine(msg));

  // A tool call is a network round-trip, so stdin can close while one is still in flight.
  // Exiting then would drop the reply and look to the host like a crash.
  let inFlight = 0;
  let closing = false;
  const settle = () => {
    if (closing && inFlight === 0) process.exit(0);
  };

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    for (const line of decoder.push(chunk)) {
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        continue;
      }
      // Batches are legal in 2025-03-26; accept one defensively, never emit one.
      const messages = Array.isArray(msg) ? msg : [msg];
      for (const m of messages) {
        try {
          const out = handleRpc(m, ctx);
          if (out && typeof (out as any).then === "function") {
            inFlight++;
            (out as Promise<object | null>)
              .then((r) => r && write(r))
              .catch((e) => {
                process.stderr.write(`triplane-ard: ${e?.stack ?? e}\n`);
                if (m?.id !== undefined) write(err(m.id, -32603, `Internal error: ${e?.message ?? e}`));
              })
              .finally(() => {
                inFlight--;
                settle();
              });
          } else if (out) {
            write(out);
          }
        } catch (e: any) {
          process.stderr.write(`triplane-ard: ${e?.stack ?? e}\n`);
          if (m?.id !== undefined) write(err(m.id, -32603, `Internal error: ${e?.message ?? e}`));
        }
      }
    }
  });

  process.stdin.on("end", () => {
    closing = true;
    settle();
  });
  process.stdin.on("close", () => {
    closing = true;
    settle();
  });
  process.stderr.write(`triplane-ard ${VERSION} ready on stdio\n`);
}
