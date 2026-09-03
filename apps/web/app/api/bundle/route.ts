import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { NextResponse } from "next/server";
import type { Graph } from "@triplane/engine";

/**
 * Plane 3: raw OKF access — list (no ?path) or fetch one markdown file.
 *
 * Everything is read from the build output, never from the source tree: `build.ts` copies
 * the bundle into public/, so this route needs no path outside the app and the bundler has
 * nothing extra to trace into the serverless function. The artifact is the build.
 */
export const dynamic = "force-dynamic";

/** Raw OKF access is for other origins by design — see the note in app/api/mcp/route.ts. */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const publicDir = () => join(process.cwd(), "public");
const graph = (): Graph => JSON.parse(readFileSync(join(publicDir(), "graph.json"), "utf8"));

export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path");

  if (!path) {
    try {
      const g = graph();
      return NextResponse.json(
        { format: "okf", bundleHash: g.bundleHash, files: g.nodes.map((n) => n.path) },
        { headers: CORS }
      );
    } catch (e: any) {
      return NextResponse.json({ error: `Bundle unavailable: ${e?.message ?? e}` }, { status: 500 });
    }
  }

  const safe = normalize(path);
  if (safe.startsWith("..") || safe.startsWith("/")) {
    return NextResponse.json({ error: "path must stay inside the bundle" }, { status: 400 });
  }
  // The bundle is markdown. Serving anything else would turn a content endpoint into a
  // file-read primitive over whatever else happens to sit in the directory.
  if (!safe.endsWith(".md")) {
    return NextResponse.json({ error: "only .md files are served" }, { status: 400 });
  }
  try {
    return new Response(readFileSync(join(publicDir(), "bundle", safe), "utf8"), {
      headers: { "content-type": "text/markdown; charset=utf-8", ...CORS }
    });
  } catch {
    return NextResponse.json({ error: `No such file: ${safe}` }, { status: 404 });
  }
}
