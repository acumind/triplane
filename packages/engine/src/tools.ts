import MiniSearch from "minisearch";
import { validateProposal } from "./proposal";
import type { Graph, ToolDef, ToolResult } from "./types";

/**
 * THE contract. Defined once, mounted twice:
 *  - adapters/webmcp.ts → document.modelContext (read + ui + write tools, in the user's session)
 *  - adapters/mcp.ts    → hosted MCP server     (read tools ONLY — ui/write never leave the browser gate)
 */

const text = (s: string): ToolResult => ({ content: [{ type: "text", text: s }] });
const j = (o: unknown) => text(JSON.stringify(o, null, 2));

function search(graph: Graph) {
  return MiniSearch.loadJS(graph.index as any, {
    fields: ["title", "body", "type"],
    storeFields: ["title", "type"],
    idField: "id"
  });
}

function node(graph: Graph, id: string) {
  return graph.nodes.find((n) => n.id === id);
}

function neighbors(graph: Graph, id: string) {
  return {
    out: graph.edges.filter((e) => e.from === id),
    in: graph.edges.filter((e) => e.to === id)
  };
}

/** BFS shortest path treating edges as undirected — "how do I get from A to B through our knowledge?" */
export function shortestPath(graph: Graph, from: string, to: string): { id: string; rel: string }[] | null {
  if (from === to) return [{ id: from, rel: "start" }];
  const adj = new Map<string, { id: string; rel: string }[]>();
  // Two passes: forward edges first so BFS prefers lineage-direction routes at equal depth.
  for (const e of graph.edges) (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push({ id: e.to, rel: e.rel });
  for (const e of graph.edges) (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push({ id: e.from, rel: `${e.rel} (rev)` });
  const prev = new Map<string, { id: string; rel: string }>();
  const q = [from];
  const seen = new Set([from]);
  while (q.length) {
    const cur = q.shift()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (seen.has(nxt.id)) continue;
      seen.add(nxt.id);
      prev.set(nxt.id, { id: cur, rel: nxt.rel });
      if (nxt.id === to) {
        const path = [{ id: to, rel: nxt.rel }];
        let p = prev.get(to);
        while (p && p.id !== from) {
          path.unshift({ id: p.id, rel: prev.get(p.id)?.rel ?? "" });
          p = prev.get(p.id);
        }
        path.unshift({ id: from, rel: "start" });
        return path;
      }
      q.push(nxt.id);
    }
  }
  return null;
}

/** Upstream closure over lineage-ish edges — powers explain_metric. */
export function upstream(graph: Graph, id: string, rels = ["source", "depends_on", "defines", "joins"]): string[] {
  const out: string[] = [];
  const q = [id];
  const seen = new Set([id]);
  while (q.length) {
    const cur = q.shift()!;
    for (const e of graph.edges) {
      if (e.from === cur && rels.includes(e.rel) && !seen.has(e.to)) {
        seen.add(e.to);
        out.push(e.to);
        q.push(e.to);
      }
    }
  }
  return out;
}

export function buildTools(): ToolDef[] {
  return [
    {
      name: "search_concepts",
      description:
        "Search the knowledge graph. Returns ranked concept hits with ids. Use this first to find relevant concepts, then get_concept for detail.",
      kind: "read",
      scope: "global",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Natural-language search query" } },
        required: ["query"]
      },
      async handler({ query }: { query: string }, ctx) {
        const hits = search(ctx.graph).search(query, { prefix: true, fuzzy: 0.2 }).slice(0, 8);
        return j(hits.map((h) => ({ id: h.id, title: h.title, type: h.type, score: Math.round(h.score * 10) / 10 })));
      }
    },
    {
      name: "get_concept",
      description: "Fetch one concept in full: frontmatter, body, and its inbound/outbound links. Always cite the concept id in answers.",
      kind: "read",
      scope: "global",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Concept id from search_concepts" } },
        required: ["id"]
      },
      async handler({ id }: { id: string }, ctx) {
        const n = node(ctx.graph, id);
        if (!n) return text(`No concept with id "${id}".`);
        return j({ ...n, links: neighbors(ctx.graph, id) });
      }
    },
    {
      name: "get_join_path",
      description:
        "Shortest path between two concepts through the knowledge graph — e.g. how a metric connects to a source table. Returns the hop sequence with relationship labels.",
      kind: "read",
      scope: "global",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Starting concept id" },
          to: { type: "string", description: "Target concept id" }
        },
        required: ["from", "to"]
      },
      async handler({ from, to }: { from: string; to: string }, ctx) {
        const p = shortestPath(ctx.graph, from, to);
        return p ? j(p) : text(`No path from ${from} to ${to}.`);
      }
    },
    {
      name: "explain_metric",
      description: "Explain a metric concept: definition plus full upstream lineage (source tables, joins, terms it depends on).",
      kind: "read",
      scope: "global",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Metric concept id" } },
        required: ["id"]
      },
      async handler({ id }: { id: string }, ctx) {
        const n = node(ctx.graph, id);
        if (!n) return text(`No concept with id "${id}".`);
        const up = upstream(ctx.graph, id).map((u) => {
          const un = node(ctx.graph, u);
          return { id: u, type: un?.type, title: un?.title };
        });
        return j({ id: n.id, title: n.title, definition: n.body.trim(), upstream: up });
      }
    },
    {
      name: "open_concept",
      description: "Navigate the visible page to a concept so the user can read it.",
      kind: "ui",
      scope: "global",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Concept id to open" } },
        required: ["id"]
      },
      async handler({ id }: { id: string }, ctx) {
        ctx.ui?.openConcept(id);
        return text(`Opened ${id}.`);
      }
    },
    {
      name: "highlight_subgraph",
      description:
        "Visually highlight concepts (and the edges between them) on the graph view so the user can follow your reasoning. Call this with the concept ids you used.",
      kind: "ui",
      scope: "global",
      inputSchema: {
        type: "object",
        properties: { ids: { type: "array", items: { type: "string" }, description: "Concept ids to light up" } },
        required: ["ids"]
      },
      async handler({ ids }: { ids: string[] }, ctx) {
        ctx.ui?.highlightSubgraph(ids);
        return text(`Highlighted ${ids.length} node(s).`); // one-liner keeps the loop token-lean
      }
    },
    {
      name: "compare_metrics",
      description: "Side-by-side comparison of two metric concepts: definitions and where their lineages diverge.",
      kind: "read",
      scope: { pageType: "metric" }, // dynamic registration showcase — only exists on metric pages
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "string", description: "First metric id" },
          b: { type: "string", description: "Second metric id" }
        },
        required: ["a", "b"]
      },
      async handler({ a, b }: { a: string; b: string }, ctx) {
        const [na, nb] = [node(ctx.graph, a), node(ctx.graph, b)];
        if (!na || !nb) return text("One or both metric ids not found.");
        const [ua, ub] = [new Set(upstream(ctx.graph, a)), new Set(upstream(ctx.graph, b))];
        return j({
          a: { id: a, definition: na.excerpt },
          b: { id: b, definition: nb.excerpt },
          shared_lineage: [...ua].filter((x) => ub.has(x)),
          only_a: [...ua].filter((x) => !ub.has(x)),
          only_b: [...ub].filter((x) => !ua.has(x))
        });
      }
    },
    {
      name: "propose_concept",
      description:
        "Draft a NEW concept as a governance proposal. This can only create a proposal for human review — it can never publish directly. Requires reviewer mode.",
      kind: "write",
      scope: "global",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Bundle-relative path, e.g. metrics/retention-rate.md" },
          markdown: { type: "string", description: "Full OKF markdown incl. frontmatter (id, type, title, links)" },
          message: { type: "string", description: "One-line proposal summary" }
        },
        required: ["path", "markdown", "message"]
      },
      async handler({ path, markdown, message }: { path: string; markdown: string; message: string }, ctx) {
        if (!ctx.store) return text("Writes are disabled here: no store attached (reviewer mode only).");
        // Lint before writing: a bad proposal must fail here, in the agent's loop where it
        // can still fix it, not later as a red build the reviewer has to decipher.
        const check = validateProposal({ path, markdown });
        if (check.id && node(ctx.graph, check.id)) {
          check.issues.push(`duplicate id: "${check.id}" already exists at ${node(ctx.graph, check.id)!.path}`);
        }
        if (check.issues.length) return j({ proposed: false, issues: check.issues });
        const p = await ctx.store.propose({ path: check.path, content: markdown, message });
        return j({ proposed: true, proposalId: p.id, review: p.diffUrl, note: "Awaiting human approval — approval is the deploy." });
      }
    }
  ];
}
