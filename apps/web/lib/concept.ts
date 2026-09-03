import type { ConceptEdge, Graph, ConceptNode } from "@triplane/engine";
import { humanizeType } from "./display";

/**
 * The concept page needs governance facts the graph does not carry: status, owner,
 * steward, review date, classification, columns, sources, usage, history. Those come
 * from OKF frontmatter, which is free-form by design.
 *
 * Everything here degrades: a bundle that declares none of it still renders a correct
 * page with those regions omitted, so the white-label promise survives a bundle that
 * has never heard of stewards.
 */

export interface Column { name: string; type?: string; classification?: string; notes?: string }
export interface LineageNode { kicker: string; label: string; href?: string; policy?: boolean }
export interface Change { version: string; summary: string; author?: string; at?: string }

export interface ConceptView {
  status: string;
  version?: string;
  verifiedAt?: string;
  owner?: string;
  steward?: string;
  nextReview?: string;
  conceptId: string;
  tags: string[];
  columns: Column[];
  upstream: LineageNode[];
  policies: LineageNode[];
  downstream: LineageNode[];
  references: { rel: string; id: string; label: string }[];
  changes: Change[];
  usage?: { humanReads?: number; agentQueries?: number; window?: string };
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Edges that mean "derived from" rather than "mentioned alongside". */
const LINEAGE = ["source", "depends_on", "joins", "defines"];
const POLICY = ["governs", "governed_by"];

export function conceptView(graph: Graph, n: ConceptNode): ConceptView {
  const fm = n.frontmatter as Record<string, unknown>;
  const title = (id: string) => graph.nodes.find((x) => x.id === id)?.title ?? id;
  const typeOf = (id: string) => graph.nodes.find((x) => x.id === id)?.type;
  const out = graph.edges.filter((e) => e.from === n.id);
  const inn = graph.edges.filter((e) => e.to === n.id);

  const node = (e: ConceptEdge, other: string): LineageNode => ({
    kicker: humanizeType(typeOf(other) ?? e.rel),
    label: title(other),
    href: `/c/${other}`,
    policy: typeOf(other) === "policy"
  });

  // Declared sources win: a table's real upstream is often a system outside the bundle.
  const declared = arr<any>(fm.sources).map((s) => ({
    kicker: str(s?.kicker) ?? "Source",
    label: str(s?.label) ?? String(s),
    href: str(s?.href)
  }));

  const upstream = declared.length ? declared : out.filter((e) => LINEAGE.includes(e.rel)).map((e) => node(e, e.to));
  const policies = [...out, ...inn]
    .filter((e) => POLICY.includes(e.rel) || typeOf(e.from === n.id ? e.to : e.from) === "policy")
    .map((e) => ({ ...node(e, e.from === n.id ? e.to : e.from), kicker: "Governed by", policy: true }));
  const downstream = inn.filter((e) => LINEAGE.includes(e.rel)).map((e) => node(e, e.from));

  return {
    status: str(fm.status) ?? "Published", // it is in the published bundle, so it is published
    version: str(fm.version),
    verifiedAt: str(fm.verified),
    owner: str(fm.owner),
    steward: str(fm.steward),
    nextReview: str(fm.next_review),
    conceptId: str(fm.concept_id) ?? n.id,
    tags: [humanizeType(n.type), ...arr<string>(fm.classifications).map(String)],
    columns: arr<any>(fm.columns).map((c) => ({
      name: String(c?.name ?? ""),
      type: str(c?.type),
      classification: str(c?.classification),
      // `value` is the natural word for a product spec; `notes` for a data schema. One
      // field, two vocabularies, so neither kind of bundle has to author the other's.
      notes: str(c?.notes) ?? str(c?.value)
    })),
    upstream,
    policies: dedupe(policies),
    downstream,
    references: inn.map((e) => ({ rel: e.rel, id: e.from, label: title(e.from) })),
    changes: arr<any>(fm.changes).map((c) => ({
      version: String(c?.version ?? ""),
      summary: String(c?.summary ?? ""),
      author: str(c?.author),
      at: str(c?.at)
    })),
    usage: fm.usage ? (fm.usage as ConceptView["usage"]) : undefined
  };
}

function dedupe(nodes: LineageNode[]): LineageNode[] {
  const seen = new Set<string>();
  return nodes.filter((n) => (seen.has(n.label) ? false : (seen.add(n.label), true)));
}

/**
 * A concept is restricted when it carries a confidential-style classification. The words
 * come from the bundle, so a bundle that classifies nothing restricts nothing.
 *
 * Lives here rather than with the permission hook: it is a pure predicate, and the
 * concept page is a server component that needs it during render.
 */
export function isRestricted(classifications: string[] = []): boolean {
  return classifications.some((c) => /confidential|restricted|secret/i.test(c));
}

/** "Published · v14 · verified 12 Aug", skipping whatever the bundle does not declare. */
export function statusLine(v: ConceptView): string {
  return [v.status, v.version && `v${v.version}`, v.verifiedAt && `verified ${v.verifiedAt}`].filter(Boolean).join(" · ");
}
