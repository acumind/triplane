/**
 * Client-safe surface. Anything reachable from a browser bundle lives here:
 * no node: builtins, so this entry can be imported from "use client" components.
 * Server-only pieces (bundle compiler, stores) are on "@triplane/engine/server".
 */
export * from "./types";
export { buildTools, shortestPath, upstream } from "./tools";
export { registerWebmcpTools, listPageTools, executePageTool, getModelContext, PageToolUnavailable, type PageTool } from "./adapters/webmcp";
export { createMcpHandler } from "./adapters/mcp";
export { buildAiCatalog, buildLlmsTxt, catalogOrigin } from "./catalog";
export { validateProposal, splitFrontmatter, type ProposalCheck } from "./proposal";
