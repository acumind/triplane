import type { Graph, ToolDef, TriplaneConfig } from "./types";

/**
 * Plane 3 artifacts. ai-catalog.json shape follows the ARD pattern:
 * publisher-hosted manifest at /.well-known/ai-catalog.json describing capabilities.
 *
 * The shape is validated at build time by `validateAiCatalog` in @triplane/ard — the same
 * function a stranger's discovery client runs against this file. The engine stays a pure
 * producer: the format belongs to the spec, not to us.
 */
/**
 * The publisher domain doubles as the deployed origin. Accept it either way:
 * a bare host gets https://, and a value that already carries a scheme is taken
 * verbatim — that is what makes `http://localhost:3000` work for a local ARD run.
 */
export function catalogOrigin(config: TriplaneConfig): string {
  const d = config.publisher.domain.trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(d) ? d : `https://${d}`;
}

export function buildAiCatalog(config: TriplaneConfig, graph: Graph, tools: ToolDef[]) {
  const origin = catalogOrigin(config);
  const capabilities: unknown[] = [
    {
      kind: "knowledge-bundle",
      format: "okf",
      description: `${config.brand.name}: ${graph.nodes.length} governed concepts, ${graph.edges.length} relationships.`,
      endpoint: `${origin}/api/bundle`,
      contentTypes: ["text/markdown"]
    }
  ];
  if (config.planes.ard.mcp) {
    capabilities.push({
      kind: "mcp-server",
      transport: "streamable-http",
      endpoint: `${origin}/api/mcp`,
      // Same gate as the handler in adapters/mcp.ts: advertise exactly what /api/mcp mounts.
      tools: tools.filter((t) => t.kind === "read" && t.scope === "global").map((t) => t.name)
    });
  }
  return {
    $schema: "https://agenticresourcediscovery.org/schema/ai-catalog.json",
    name: config.brand.name,
    description: config.brand.tagline ?? "",
    publisher: config.publisher,
    updatedAt: graph.builtAt,
    bundleHash: graph.bundleHash,
    capabilities
  };
}

export function buildLlmsTxt(config: TriplaneConfig): string {
  const origin = catalogOrigin(config);
  return [
    `# ${config.brand.name}`,
    `> ${config.brand.tagline ?? ""}`,
    ``,
    `## Agent access`,
    `- Catalog: ${origin}/.well-known/ai-catalog.json`,
    `- Raw OKF bundle: ${origin}/api/bundle`,
    config.planes.ard.mcp ? `- MCP server: ${origin}/api/mcp` : ``,
    ``
  ].join("\n");
}
