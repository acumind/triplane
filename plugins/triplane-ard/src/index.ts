/**
 * The ARD client, as a library.
 *
 * Zero runtime dependencies, and it imports nothing from @triplane/engine on purpose: a
 * discovery client that shared code with the site it discovers would be assuming the
 * answer. This is also what lets the stdio server run from a copied-out plugin directory
 * with no node_modules at all.
 */
export { discover, type DiscoverOptions } from "./discover.ts";
export { validateAiCatalog, type CatalogCheck } from "./catalog-schema.ts";
export { McpHttpClient, extractJsonRpc, type McpClientOptions } from "./mcp-http-client.ts";
export { parseLlmsTxt, type LlmsPointers } from "./llms-txt.ts";
export { normalizeDomain, hostOf, isLoopbackHost, isPrivateHost, sameRegistrableSuffix } from "./origin.ts";
export { fetchText, parseJsonOrThrow, guardTarget, MAX_BYTES } from "./http.ts";
export { ArdError, isArdError, type ArdErrorCode } from "./errors.ts";
export type {
  AiCatalog,
  Capability,
  DiscoveryResult,
  RemoteTool,
  SiteRecord,
  TrustLevel,
  TrustVerdict,
  Waiver
} from "./types.ts";
