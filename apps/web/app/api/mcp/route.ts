import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { buildTools, createMcpHandler, type Graph } from "@triplane/engine";
import config from "../../../../../triplane.config";

/** Plane 3: stateless MCP-over-HTTP endpoint (read tools only). */
export async function POST(req: Request) {
  const graph: Graph = JSON.parse(readFileSync(join(process.cwd(), "public/graph.json"), "utf8"));
  const handle = createMcpHandler(buildTools(), graph, config.brand.name);
  const out = await handle(await req.json());
  return out === null ? new Response(null, { status: 202 }) : NextResponse.json(out);
}
