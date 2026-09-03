/**
 * Client-safe validation for proposed concept files.
 *
 * Runs at propose() time, on both sides of the wire: the write tool calls it in the
 * browser so the agent gets lint feedback in the loop, and the governance route calls
 * it again on the server, because a client-side check is a courtesy, not a gate.
 *
 * Deliberately regex-based rather than gray-matter: gray-matter requires node:fs at
 * module load, and this file has to be importable from a "use client" component.
 */

export interface ProposalCheck {
  /** The normalized, bundle-relative path. Only meaningful when `issues` is empty. */
  path: string;
  /** Concept id the compiler would assign: frontmatter `id`, else the filename stem. */
  id?: string;
  type?: string;
  title?: string;
  /** Human-readable lint errors, in the same voice as the build lint. */
  issues: string[];
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

function field(fm: string, key: string): string | undefined {
  // `^` under /m keeps this to top-level keys — nested YAML is indented.
  const m = fm.match(new RegExp(`^${key}:[ \\t]*(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") || undefined : undefined;
}

/**
 * Split a concept file into its frontmatter block and body. Client-safe counterpart to
 * the gray-matter call in the compiler, for surfaces that render markdown in the browser.
 */
export function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const m = markdown.match(FRONTMATTER);
  return m ? { frontmatter: m[1], body: markdown.slice(m[0].length).replace(/^\r?\n/, "") } : { frontmatter: "", body: markdown };
}

export function validateProposal(input: { path: string; markdown: string }): ProposalCheck {
  const issues: string[] = [];
  const path = String(input.path ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
  const markdown = String(input.markdown ?? "");

  if (!path) issues.push("path is required");
  if (/^(?:[a-zA-Z]:)?\//.test(path)) issues.push(`path must be bundle-relative, not absolute: "${path}"`);
  if (path.split("/").includes("..")) issues.push(`path must stay inside the bundle — ".." is not allowed: "${path}"`);
  if (path.split("/").some((seg) => seg.startsWith("."))) issues.push(`path segments must not start with "." : "${path}"`);
  if (path && !path.endsWith(".md")) issues.push(`path must end in .md — concepts are markdown files: "${path}"`);
  if (path && !/^[a-zA-Z0-9._/-]+$/.test(path)) issues.push(`path may only contain letters, digits, "." "_" "-" and "/": "${path}"`);

  const fm = markdown.match(FRONTMATTER)?.[1];
  if (!fm) {
    issues.push("markdown must open with a YAML frontmatter block delimited by ---");
    return { path, issues };
  }

  const type = field(fm, "type");
  const title = field(fm, "title");
  const id = field(fm, "id") ?? path.replace(/\.md$/, "").split("/").pop();
  if (!type) issues.push("missing required frontmatter field: type");
  if (id && !/^[a-z0-9-]+$/.test(id)) issues.push(`concept id must be lowercase kebab-case (got "${id}") — [[wikilinks]] only resolve that form`);
  if (!markdown.slice(markdown.indexOf("---", 3) + 3).trim()) issues.push("concept body is empty");

  return { path, id, type, title, issues };
}
