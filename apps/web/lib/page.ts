import type { Graph } from "@triplane/engine";

/**
 * Which page are we on, in the vocabulary the tool contract uses.
 *
 * Page-scoped tools register on `{ pageType }`, so this answer decides which tools
 * exist right now. The registrar (WebMCPProvider) and the agent that calls them
 * (Sidebar) must agree exactly — when they disagree, the agent offers the model a
 * tool the browser never registered and the call fails as "unknown tool".
 */
export function conceptIdFromPath(pathname: string): string {
  return pathname.startsWith("/c/") ? decodeURIComponent(pathname.split("/")[2] ?? "") : "";
}

export function pageTypeFor(graph: Graph, pathname: string): string | undefined {
  const id = conceptIdFromPath(pathname);
  return id ? graph.nodes.find((n) => n.id === id)?.type : undefined;
}

/**
 * A sample question drawn from the bundle itself. Hardcoding one would put the demo
 * bundle's vocabulary on every deployment — the same white-label leak the engine's
 * greptest guards against, one layer up.
 */
export function sampleQuestion(graph: Graph): string {
  const metric = graph.nodes.find((n) => n.type === "metric");
  if (metric) return `How is ${metric.title.toLowerCase()} computed, end to end?`;
  // "What is <title>" reads badly against titles that are already sentences
  // ("Getting started"); an imperative works for any bundle's vocabulary.
  const n = graph.nodes.find((x) => x.type === "runbook") ?? graph.nodes[0];
  return n ? `Explain ${n.title} and how it connects to the rest.` : "";
}
