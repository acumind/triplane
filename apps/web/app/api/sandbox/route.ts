import { NextResponse } from "next/server";
import { compileFiles, buildTools, buildAiCatalog, validateProposal, type SourceFile } from "@triplane/engine/server";
import config from "../../../../../triplane.config";

/**
 * Compile a bundle that was never written to disk.
 *
 * The point is that this is the SAME compiler the build uses — compileFiles is what
 * compileBundle delegates to — so what the sandbox shows is what a deployment would
 * publish. Nothing here writes: no store, no proposal, no file. A preview that quietly
 * mutated the deployment would be a very different feature.
 */
export const dynamic = "force-dynamic";

const MAX_FILES = 50;
const MAX_BYTES = 512 * 1024;

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(req: Request) {
  let body: { files?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Malformed request body.", 400);
  }

  const raw = Array.isArray(body.files) ? body.files : null;
  if (!raw?.length) return fail("Send at least one markdown file.", 400);
  if (raw.length > MAX_FILES) return fail(`Too many files: ${raw.length}. The limit is ${MAX_FILES}.`, 413);

  const files: SourceFile[] = [];
  let bytes = 0;
  for (const f of raw as { path?: unknown; content?: unknown }[]) {
    const content = typeof f?.content === "string" ? f.content : "";
    // Reuse the same path rules the write tool enforces: no traversal, no absolute
    // paths, markdown only. Nothing is written, but these paths end up in the graph.
    const check = validateProposal({ path: String(f?.path ?? ""), markdown: content });
    const pathProblem = check.issues.find((i) => i.toLowerCase().startsWith("path"));
    if (pathProblem) return fail(pathProblem, 400);
    bytes += content.length;
    if (bytes > MAX_BYTES) return fail(`Too much content: the limit is ${Math.round(MAX_BYTES / 1024)} KB.`, 413);
    files.push({ path: check.path, content });
  }

  try {
    const { graph, issues } = compileFiles(files);
    const tools = buildTools();
    // Show the catalog this bundle WOULD publish, under the viewer's own origin.
    const origin = new URL(req.url).origin;
    const catalog = buildAiCatalog(
      { ...config, brand: { ...config.brand, name: "Your bundle" }, publisher: { ...config.publisher, domain: origin } },
      graph,
      tools
    );
    return NextResponse.json({
      graph,
      issues,
      tools: tools.map((t) => ({ name: t.name, kind: t.kind, scope: t.scope, description: t.description })),
      catalog
    });
  } catch (e: any) {
    // compileFiles turns bad frontmatter into a lint issue, so reaching here means
    // something unexpected — say what, rather than showing a blank result.
    return fail(`Could not compile that bundle: ${e?.message ?? e}`, 500);
  }
}
