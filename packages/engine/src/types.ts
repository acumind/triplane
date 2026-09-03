/** Triplane engine types — bundle-agnostic by construction (see scripts/greptest.sh). */

export interface TriplaneConfig {
  /** Path to the OKF bundle directory (markdown + YAML frontmatter). */
  bundle: string;
  brand: { name: string; tagline?: string; accent: string };
  /** Emitted into /.well-known/ai-catalog.json — identifies who publishes this knowledge. */
  publisher: { name: string; domain: string; contact?: string };
  planes: {
    webmcp: { enabled: boolean; originTrialToken?: string };
    ard: { enabled: boolean; mcp: boolean };
  };
  /** `bundleRoot` maps bundle-relative paths to their location inside the repo (defaults to the repo root). */
  store: { kind: "github"; repo: string; base: string; bundleRoot?: string } | { kind: "fs" };
}

/** One OKF concept = one markdown file with YAML frontmatter. */
export interface ConceptNode {
  id: string;
  type: string; // table | metric | join-path | runbook | term | policy | domain | ...
  title: string;
  path: string; // bundle-relative file path
  frontmatter: Record<string, unknown>;
  excerpt: string;
  body: string;
}

export interface ConceptEdge {
  from: string;
  to: string;
  rel: string; // source | depends_on | joins | defines | governs | mentions | ...
}

export interface Graph {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  /** Serialized MiniSearch index over id/title/body. */
  index: unknown;
  bundleHash: string;
  builtAt: string;
}

export type JSONSchema = Record<string, unknown>;
export type ToolKind = "read" | "ui" | "write";

export interface ToolResult {
  content: { type: "text"; text: string }[];
}

/** Browser-side bridge; present only when tools run inside the page. */
export interface UIBridge {
  openConcept(id: string): void;
  highlightSubgraph(ids: string[]): void;
}

/**
 * All the write tool ever needs. Narrower than BundleStore on purpose: the tool runs
 * in the browser, so the thing satisfying this is usually an HTTP client, not fs.
 * A full BundleStore satisfies it structurally.
 */
export type ProposalSink = Pick<BundleStore, "propose">;

export interface ToolCtx {
  graph: Graph;
  ui?: UIBridge; // injected by the WebMCP adapter only
  store?: ProposalSink; // injected only where writes are permitted (reviewer mode)
}

export interface ToolDef<I = any> {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  kind: ToolKind;
  /** "global" registers everywhere; { pageType } registers only on matching concept pages (fires toolchange). */
  scope: "global" | { pageType: string };
  handler(args: I, ctx: ToolCtx): Promise<ToolResult>;
}

export interface Proposal {
  id: string;
  diffUrl: string;
  /** One-line summary supplied at propose() time. */
  message?: string;
  /** Bundle-relative paths this proposal adds or changes. */
  paths?: string[];
  /** ISO timestamp, for ordering the review queue. */
  createdAt?: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  at: string;
}

/**
 * Storage seam. Git is the v1 ledger, never the door:
 * propose() opens a PR, approve() merges it — the only write path to main.
 * Swappable backend = the "independent of dev-oriented git infra" answer.
 */
export interface BundleStore {
  read(path: string): Promise<string>;
  list(): Promise<string[]>;
  propose(change: { path: string; content: string; message: string }): Promise<Proposal>;
  /** The review queue: everything proposed but not yet approved or rejected. */
  listProposals(): Promise<Proposal[]>;
  /** One file as the proposal would leave it — the "after" side of the review diff. */
  readProposal(id: string, path: string): Promise<string>;
  approve(id: string): Promise<void>;
  reject(id: string): Promise<void>;
  history(path?: string): Promise<CommitInfo[]>;
}
