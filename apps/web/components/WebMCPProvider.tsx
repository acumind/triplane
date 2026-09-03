"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { buildTools, registerWebmcpTools, type Graph, type UIBridge } from "@triplane/engine";
import { emitHighlight } from "../lib/bus";
import { pageTypeFor } from "../lib/page";
import { useReviewerMode } from "../lib/reviewer";
import { remoteStore } from "../lib/propose";

let graphCache: Graph | null = null;
/**
 * The graph every client surface reads. A non-2xx returns an HTML error page, and
 * calling .json() on that throws "Unexpected token <" — which tells a caller nothing.
 * Fail with the status instead, and do not poison the cache, so a retry can succeed.
 */
export async function loadGraph(): Promise<Graph> {
  if (graphCache) return graphCache;
  const res = await fetch("/graph.json");
  if (!res.ok) throw new Error(`graph.json is unavailable (HTTP ${res.status}) — has the bundle been built?`);
  graphCache = (await res.json()) as Graph;
  return graphCache;
}

/** Plane 2 wiring: (re)registers the tool contract on every route change.
 *  Page-scoped tools appear/disappear with the page type → fires `toolchange`. */
export function WebMCPProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const reviewer = useReviewerMode();

  useEffect(() => {
    let disposed = false;
    let set: { unregisterAll(): void } | null = null;
    (async () => {
      const graph = await loadGraph();
      if (disposed) return;
      const pageType = pageTypeFor(graph, pathname); // shared with Sidebar — see lib/page.ts
      const ui: UIBridge = {
        openConcept: (cid) => router.push(`/c/${cid}`),
        highlightSubgraph: (ids) => emitHighlight(ids)
      };
      // The store is the write permission: without it propose_concept reports that
      // writes are disabled, so reviewer mode gates the capability, not just the button.
      const registered = registerWebmcpTools(buildTools(), { graph, ui, store: reviewer ? remoteStore : undefined }, pageType);
      // The cleanup may already have run while loadGraph() was in flight — it captured a
      // null `set` and unregistered nothing, so these tools would leak and the next pass
      // would collide with them ("Duplicate tool name").
      if (disposed) registered.unregisterAll();
      else set = registered;
    })();
    return () => {
      disposed = true;
      set?.unregisterAll();
    };
  }, [pathname, router, reviewer]);

  return <>{children}</>;
}
