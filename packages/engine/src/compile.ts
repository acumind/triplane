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

export function compileBundle(bundleDir: string): { graph: Graph; issues: LintIssue[] } {
  const files = walk(bundleDir).filter((f) => f.endsWith(".md"));
  const issues: LintIssue[] = [];
  const nodes: ConceptNode[] = [];
  const edges: ConceptEdge[] = [];

  for (const file of files) {
    const rel = relative(bundleDir, file);
    const raw = readFileSync(file, "utf8");
    const { data, content } = matter(raw);

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
  index.addAll(nodes.map((n) => ({ id: n.id, title: n.title, body: n.body, type: n.type })));

  const bundleHash = createHash("sha256")
    .update(files.map((f) => readFileSync(f, "utf8")).join("\u0000"))
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
