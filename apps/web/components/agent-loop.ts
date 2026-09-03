"use client";
import { buildTools, executePageTool, getModelContext, listPageTools, type Graph, type UIBridge } from "@triplane/engine";
import { pageTypeFor } from "../lib/page";
import { remoteStore } from "../lib/propose";

/**
 * Plane 2's agent side, unchanged by the redesign — only the panel around it moved.
 *
 * Original notes:
 * Plane 2's agent side. The loop is BROWSER-DRIVEN because tools touch the DOM:
 * model calls proxy through /api/agent; tool execution stays client-side.
 * Uses modelContext.executeTool when the browser exposes it (proving the real API),
 * otherwise falls back to invoking the same contract directly — identical behavior.
 */

type Msg = { role: "user" | "assistant"; content: any };
type ClaudeTool = { name: string; description: string; input_schema: unknown };

/** A tool schema the model API will accept: an object, not a string or undefined. */
const isSchema = (v: unknown): boolean => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * What the model may call, right here, right now.
 *
 * Under real WebMCP the browser's registry is the source of truth — offering a tool it
 * did not register is how you get "unknown tool" mid-demo. Without WebMCP we reproduce
 * the same set from the contract, filtered by this page's type. Write tools are excluded
 * on both paths until reviewer mode exists (T4).
 */
async function toolsForPage(graph: Graph, pathname: string, reviewer: boolean): Promise<ClaudeTool[]> {
  const contract = buildTools();
  // Write tools exist only in reviewer mode, and even there they can only draft a
  // proposal — publishing needs a human in /govern.
  const allowed = (name: string) => reviewer || contract.find((t) => t.name === name)?.kind !== "write";

  if (getModelContext()) {
    const registered = await listPageTools();
    // The registry says WHICH tools are live on this page. The schema comes from our own
    // contract, which is authoritative and correctly shaped — the browser descriptor is
    // an origin-trial surface, and a malformed input_schema is a hard 400 from the model
    // API rather than a graceful degradation. If nothing usable survives, fall through.
    const fromRegistry = registered
      .filter((t) => allowed(t.name))
      .map((t) => {
        const own = contract.find((c) => c.name === t.name);
        const schema = own?.inputSchema ?? t.inputSchema;
        return isSchema(schema)
          ? { name: t.name, description: own?.description ?? t.description, input_schema: schema }
          : null;
      })
      .filter((t): t is ClaudeTool => t !== null);
    if (fromRegistry.length) return fromRegistry;
  }

  const pageType = pageTypeFor(graph, pathname);
  return contract
    .filter((t) => allowed(t.name) && (t.scope === "global" || t.scope.pageType === pageType))
    .map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
}

async function runTool(
  name: string,
  args: unknown,
  graph: Graph,
  ui: UIBridge,
  reviewer: boolean,
  signal: AbortSignal
): Promise<string> {
  // No store outside reviewer mode: propose_concept then reports writes are disabled
  // rather than half-working.
  const local = async () => {
    const t = buildTools().find((x) => x.name === name);
    if (!t) return `Unknown tool ${name}`;
    const r = await t.handler(args as any, { graph, ui, store: reviewer ? remoteStore : undefined });
    return r.content[0].text;
  };

  // Prefer the real registry — driving document.modelContext is the point of plane 2.
  // But it is an origin trial: if its calling convention doesn't match, run the same
  // handler directly rather than failing the user's question. Identical behaviour.
  if (getModelContext()) {
    try {
      const r: any = await executePageTool(name, args, signal);
      return r?.content?.[0]?.text ?? JSON.stringify(r);
    } catch (e: any) {
      if (signal.aborted || e?.name === "AbortError") throw e;
      console.warn(`[triplane] WebMCP executeTool failed for "${name}", using the local contract:`, e);
    }
  }
  return local();
}


export type { Msg, ClaudeTool };
export { toolsForPage, runTool };
