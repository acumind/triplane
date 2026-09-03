"use client";
import type { IconName } from "../components/Icon";

/**
 * Everywhere the shell can take you that is not a concept.
 *
 * One list, read by the sidebar nav and by ⌘K, so a destination cannot exist in one and
 * not the other. Concepts are deliberately absent — those come from the graph, and the
 * tree and the palette already build them from it.
 *
 * This exists because every route here used to be reachable only by typing a URL or from
 * the product landing page, which tenant deployments do not show. A knowledge base whose
 * sandbox you can only find by guessing `/sandbox` is a knowledge base with a hidden
 * feature.
 */
export interface Destination {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  /** Right-aligned hint in ⌘K and in menus. */
  note?: string;
  /** A build artifact or an API response, not a Next route: open it, don't route to it. */
  external?: boolean;
}

/**
 * `landing` is the config flag that puts the product pitch on "/" — true only on
 * Triplane's own deployment. It moves the concept index to /concepts, so the index link
 * has to follow it rather than hardcode either path.
 */
export function shellDestinations(landing: boolean): { views: Destination[]; machine: Destination[] } {
  const views: Destination[] = [
    ...(landing ? [{ id: "overview", label: "Overview", href: "/", icon: "info" as IconName }] : []),
    { id: "index", label: "Concept index", href: landing ? "/concepts" : "/", icon: "index" },
    { id: "govern", label: "Review queue", href: "/govern", icon: "inbox" },
    { id: "sandbox", label: "Sandbox", href: "/sandbox", icon: "beaker", note: "any bundle" }
  ];

  // Plane 3, as the ecosystem sees it. Same origin, so these are the actual artifacts the
  // catalog advertises — not a description of them.
  const machine: Destination[] = [
    { id: "catalog", label: "ai-catalog.json", href: "/.well-known/ai-catalog.json", icon: "braces", note: "ARD", external: true },
    { id: "llms", label: "llms.txt", href: "/llms.txt", icon: "braces", external: true },
    { id: "graph", label: "graph.json", href: "/graph.json", icon: "braces", note: "compiled", external: true },
    { id: "okf", label: "Raw OKF bundle", href: "/api/bundle", icon: "braces", note: "markdown", external: true }
  ];

  return { views, machine };
}
