import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import matter from "gray-matter";
import MiniSearch from "minisearch";
import type { ConceptEdge, ConceptNode, Graph } from "./types";

/** [[wiki-link]] → edge rel:"mentions". Frontmatter `links: [{to, rel}]` → typed edges. */
const WIKILINK = /\[\[([a-z0-9-]+)\]\]/g;

export interface LintIssue {
  level: "error" | "warn";
  file: string;
  message: string;
}

/** One source file: a bundle-relative path and its markdown. */
export interface SourceFile {
  path: string;
  content: string;
}

/**
 * Read a bundle off disk and compile it. Thin wrapper over compileFiles — the walk and
 * the reads are the only filesystem-dependent part of compiling.
 */
export function compileBundle(bundleDir: string): { graph: Graph; issues: LintIssue[] } {
  return compileFiles(
    walk(bundleDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ path: relative(bundleDir, f), content: readFileSync(f, "utf8") }))
  );
}

/**
 * Compile markdown into a graph, with no filesystem at all.
 *
 * This is the whole compiler: the same lint, the same edges, the same bundle hash whether
 * the input came from a directory or an upload. Keeping one code path is the point —
 * a sandbox that previewed a bundle through a second, subtly different compiler would be
 * showing the user something the build would not produce.
 */
export function compileFiles(files: SourceFile[]): { graph: Graph; issues: LintIssue[] } {
  const issues: LintIssue[] = [];
  const nodes: ConceptNode[] = [];
  const edges: ConceptEdge[] = [];

  for (const file of files) {
    const rel = file.path;

    // Malformed frontmatter is a fact about the file, not a reason to abandon the build.
    // gray-matter throws a YAMLException, which crashed the whole compile with a stack
    // trace — unusable in a build log and a 500 for anything compiling untrusted input.
    let data: Record<string, unknown>;
    let content: string;
    try {
      ({ data, content } = matter(file.content) as { data: Record<string, unknown>; content: string });
    } catch (e: any) {
      issues.push({ level: "error", file: rel, message: `unreadable frontmatter: ${e?.reason ?? e?.message ?? e}` });
      continue;
    }

    if (!data.type) issues.push({ level: "error", file: rel, message: "missing required frontmatter field: type" });
    const id = (data.id as string) ?? rel.replace(/\.md$/, "").split("/").pop()!;
    if (nodes.some((n) => n.id === id)) issues.push({ level: "error", file: rel, message: `duplicate id: ${id}` });

    nodes.push({
      id,
      type: String(data.type ?? "unknown"),
      title: String(data.title ?? id),
      path: rel,
      frontmatter: data,
      excerpt: content.trim().split("\n").find((l) => l.trim() && !l.startsWith("#"))?.slice(0, 200) ?? "",
      body: content
    });

    for (const link of (data.links as { to: string; rel: string }[] | undefined) ?? []) {
      edges.push({ from: id, to: link.to, rel: link.rel ?? "related" });
    }
    for (const m of content.matchAll(WIKILINK)) {
      if (m[1] !== id) edges.push({ from: id, to: m[1], rel: "mentions" });
    }
  }

  // Lint: broken links + orphans
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (!ids.has(e.to)) issues.push({ level: "error", file: e.from, message: `broken link → ${e.to}` });
  }
  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  for (const n of nodes) {
    if (!connected.has(n.id)) issues.push({ level: "warn", file: n.path, message: `orphan node: ${n.id}` });
  }

  const index = new MiniSearch({
    fields: ["title", "body", "type"],
    storeFields: ["title", "type"],
    idField: "id"
  });
  // Index unique ids only. A duplicate is already an error above, and MiniSearch throws on
  // one — which turned a lint message a person can act on into a stack trace, and would
  //500 any caller compiling untrusted input rather than reporting what is wrong with it.
  const indexed = new Set<string>();
  index.addAll(
    nodes
      .filter((n) => (indexed.has(n.id) ? false : (indexed.add(n.id), true)))
      .map((n) => ({ id: n.id, title: n.title, body: n.body, type: n.type }))
  );

  const bundleHash = createHash("sha256")
    .update(files.map((f) => f.content).join("\u0000"))
    .digest("hex")
    .slice(0, 12);

  const graph: Graph = {
    nodes,
    edges: dedupe(edges),
    index: index.toJSON(),
    bundleHash,
    builtAt: new Date().toISOString()
  };
  return { graph, issues };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith(".")) return []; // .proposals/ and friends are not part of the published bundle
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function dedupe(edges: ConceptEdge[]): ConceptEdge[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    const k = `${e.from}→${e.to}:${e.rel}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
