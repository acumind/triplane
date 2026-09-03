import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { buildTools, createMcpHandler, type Graph } from "@triplane/engine";
import config from "../../../../../triplane.config";

/**
 * Plane 3: stateless MCP-over-HTTP endpoint (read tools only).
 *
 * Open to any origin on purpose. An agent discovering this site through its catalog is by
 * definition running somewhere else; refusing cross-origin reads here would mean plane 3
 * only worked from a terminal. Nothing behind it is credentialed — these are the same
 * published concepts the website serves.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type"
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const graph: Graph = JSON.parse(readFileSync(join(process.cwd(), "public/graph.json"), "utf8"));
  const handle = createMcpHandler(buildTools(), graph, config.brand.name);
  const out = await handle(await req.json());
  return out === null
    ? new Response(null, { status: 202, headers: CORS })
    : NextResponse.json(out, { headers: CORS });
}
