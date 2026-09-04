/**
 * Shapes an ARD client sees on the wire.
 *
 * Deliberately structural, not imported from the engine: a discovery client that shared
 * types with the site it discovers would be proving nothing. Everything here describes
 * what *any* publisher might serve, and every field is optional until validated.
 */

export interface Capability {
  kind: string;
  endpoint?: string;
  transport?: string;
  format?: string;
  description?: string;
  contentTypes?: string[];
  tools?: string[];
  [k: string]: unknown;
}

export interface AiCatalog {
  $schema?: string;
  name: string;
  description?: string;
  publisher: { name: string; domain: string; contact?: string; [k: string]: unknown };
  updatedAt?: string;
  bundleHash?: string;
  capabilities: Capability[];
  [k: string]: unknown;
}

/**
 * What the publisher check concluded — a verdict, never a boolean. A boolean would force
 * the caller to invent the nuance, and the nuance is the honest part.
 */
export type TrustLevel =
  | "verified-origin"
  | "related-origin"
  | "unverified-local"
  | "foreign-origin"
  | "missing-publisher";

export interface TrustVerdict {
  level: TrustLevel;
  claimedHost: string | null;
  servingHost: string;
  scheme: string;
  /** Whether the capability endpoint lives on the host that served the catalog. */
  endpointCheck: "same-host" | "offsite" | "n/a";
  /** One sentence, rendered verbatim to the model. Never overstate this. */
  proves: string;
  doesNotProve: string[];
}

export type Waiver = "unverified-publisher" | "offsite-endpoint" | "insecure-transport";

export interface DiscoveryResult {
  /** The origin that actually served the catalog — after redirects, not what was asked for. */
  origin: string;
  requestedOrigin: string;
  catalogUrl: string;
  via: "well-known" | "llms.txt";
  redirects: string[];
  catalog: AiCatalog;
  /** Errors are absent by construction: an invalid catalog throws rather than returning. */
  validation: { warnings: string[] };
  trust: TrustVerdict;
  capabilities: { mcp?: Capability; bundle?: Capability; other: Capability[] };
  /** Set when a loopback origin advertised a non-loopback endpoint and we rewrote it. */
  endpointRewrittenFrom?: string;
  /**
   * Decided ONCE, from the origin the user asked for — never from an endpoint a catalog
   * advertises. Every later fetch for this site reads it from here. Deriving it per-endpoint
   * is what let a catalog naming a private address switch its own guard off.
   */
  allowPrivate: boolean;
  /** Checks the caller explicitly waived. Always present so a result cannot hide one. */
  waived: Waiver[];
}

export interface RemoteTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface SiteRecord {
  origin: string;
  discovery: DiscoveryResult;
  endpoint?: string;
  tools?: RemoteTool[];
  toolsFetchedAt?: number;
  discoveredAt: number;
}
