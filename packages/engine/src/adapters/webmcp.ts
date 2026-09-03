import type { ToolCtx, ToolDef } from "../types";

/**
 * The only place in the codebase that touches the WebMCP API.
 * The API is an origin trial (Chrome 149+, Edge 150+): feature-detect, expect renames,
 * and keep every volatile assumption inside this file.
 */

type ModelContext = {
  registerTool(tool: {
    name: string;
    description: string;
    inputSchema: unknown;
    execute(args: any, opts?: { signal?: AbortSignal }): Promise<unknown>;
  }): { unregister?: () => void } | void;
  unregisterTool?(name: string): void;
};

export function getModelContext(): ModelContext | undefined {
  // Isomorphic + lib-agnostic: reach the globals through globalThis so the engine
  // typechecks without the DOM lib (it also runs in node for the MCP plane).
  const g = globalThis as any;
  if (!g.document) return undefined;
  // Chrome 150 moved navigator.modelContext → document.modelContext (alias kept). Detect both.
  return (g.document.modelContext ?? g.navigator?.modelContext) as ModelContext | undefined;
}

export interface RegisteredSet {
  names: string[];
  unregisterAll(): void;
}

/**
 * The handles `registerTool()` hands back, keyed by tool name.
 *
 * These ARE the browser's `RegisteredTool` objects, and the native `executeTool()`
 * takes one — passing a name instead fails with "The provided value is not of type
 * 'RegisteredTool'". The implementation also ships no enumerator, so this map doubles
 * as the page's tool inventory. Registering is therefore the only way to learn either
 * fact, which is why we keep what we registered instead of discarding it.
 */
const registered = new Map<string, { handle: unknown; def: ToolDef }>();

/**
 * Register every tool whose scope matches the current page.
 * Call again on SPA navigation with the new pageType — re-registration fires `toolchange`
 * for connected agents, which is the dynamic-toolset demo beat.
 */
export function registerWebmcpTools(tools: ToolDef[], ctx: ToolCtx, pageType?: string): RegisteredSet {
  const mc = getModelContext();
  if (!mc) return { names: [], unregisterAll: () => {} };

  const active = tools.filter((t) => t.scope === "global" || (pageType && t.scope.pageType === pageType));
  const disposers: (() => void)[] = [];

  for (const t of active) {
    const handle = mc.registerTool({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      async execute(args: any, opts?: { signal?: AbortSignal }) {
        opts?.signal?.throwIfAborted?.();
        const result = await t.handler(args, ctx);
        return result; // { content: [{type:"text", text}] } — MCP-shaped result
      }
    });
    registered.set(t.name, { handle, def: t });
    disposers.push(() => {
      registered.delete(t.name);
      if (handle && typeof handle === "object" && "unregister" in handle && handle.unregister) handle.unregister();
      else mc.unregisterTool?.(t.name);
    });
  }

  return {
    names: active.map((t) => t.name),
    unregisterAll: () => disposers.forEach((d) => d())
  };
}

export interface PageTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

/**
 * In-page agent side of the same API (the sidebar drives its loop from this).
 *
 * Normalizes on the way out. The registry is an origin-trial surface and its descriptor
 * shape is not settled — the enumerator has been spelled `getTools`, `listTools` and a
 * plain `tools` property, and the schema field arrives as `inputSchema`, `input_schema`
 * or `parameters` depending on build. Callers hand these straight to a model API where a
 * missing schema is a hard 400, so absorbing the variance here is the whole point of this
 * file existing.
 */
/** The registry's own descriptor objects, unnormalized — they carry whatever handles it gives us. */
async function rawTools(mc: any): Promise<any[]> {
  try {
    const raw = await (mc.getTools?.() ?? mc.listTools?.() ?? mc.tools ?? []);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return []; // an unusable registry is a fallback signal, not a crash
  }
}

export async function listPageTools(): Promise<PageTool[]> {
  const mc = getModelContext() as any;
  if (!mc) return [];
  const enumerated = (await rawTools(mc))
    .map((t: any) => ({
      name: t?.name,
      description: t?.description ?? "",
      inputSchema: t?.inputSchema ?? t?.input_schema ?? t?.parameters ?? t?.schema
    }))
    .filter((t): t is PageTool => typeof t.name === "string" && t.name.length > 0);
  if (enumerated.length) return enumerated;
  // No enumerator on this implementation: what we registered for this page IS the
  // inventory, and re-registration on navigation keeps it honest.
  return [...registered.values()].map(({ def }) => ({
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema
  }));
}

/** Thrown when no call shape works, so the caller can run the same contract locally. */
export class PageToolUnavailable extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "PageToolUnavailable";
  }
}

/**
 * Execute a tool through the page registry.
 *
 * The calling convention is not settled either: some builds take the RegisteredTool
 * object (`executeTool(name, …)` fails there with "The provided value is not of type
 * 'RegisteredTool'"), some take the name, and some put `execute` on the descriptor
 * itself. Try each, in that order, and report failure as PageToolUnavailable so the
 * caller can fall back to the identical local handler rather than dead-ending the user.
 */
export async function executePageTool(name: string, args: unknown, signal?: AbortSignal): Promise<unknown> {
  const mc = getModelContext() as any;
  if (!mc) throw new PageToolUnavailable("no modelContext in this browser");
  const opts = signal ? { signal } : undefined;
  // The handle from registerTool() first: on the native implementation it is the only
  // thing executeTool() accepts, and there is no enumerator to recover it from.
  const handle = registered.get(name)?.handle as any;
  const enumerated = (await rawTools(mc)).find((t: any) => t?.name === name);

  const shapes: (() => unknown)[] = [
    () => (handle && mc.executeTool ? mc.executeTool(handle, args, opts) : undefined),
    () => (typeof handle?.execute === "function" ? handle.execute(args, opts) : undefined),
    () => (enumerated && mc.executeTool ? mc.executeTool(enumerated, args, opts) : undefined),
    () => (typeof enumerated?.execute === "function" ? enumerated.execute(args, opts) : undefined),
    () => (mc.executeTool ? mc.executeTool(name, args, opts) : undefined),
    () => (typeof enumerated?.callback === "function" ? enumerated.callback(args, opts) : undefined)
  ];

  let last: unknown;
  for (const shape of shapes) {
    try {
      const result = await shape();
      if (result !== undefined) return result;
    } catch (e) {
      // An abort is the user pressing Stop — surface it, never retry it as a shape mismatch.
      if (signal?.aborted || (e as any)?.name === "AbortError") throw e;
      last = e;
    }
  }
  throw new PageToolUnavailable(`no working executeTool shape for "${name}"`, last);
}
