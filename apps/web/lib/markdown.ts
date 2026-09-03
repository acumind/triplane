import { marked } from "marked";
import { splitFrontmatter } from "@triplane/engine";

/**
 * One markdown path for concept pages and the governance console, so a proposal is
 * reviewed in exactly the rendering it will publish into.
 * `[[wikilink]]` is the bundle's own link syntax and is rewritten before markdown sees it.
 */
export function renderConcept(body: string): string {
  return marked.parse(body.replace(/\[\[([a-z0-9-]+)\]\]/g, '<a href="/c/$1">$1</a>')) as string;
}

/**
 * Split the opening paragraph off as the page lead.
 *
 * The graph's `excerpt` is the raw first LINE truncated to 200 characters, which is fine
 * for search results and wrong for a headline: it shows `[[wikilink]]` and `**bold**`
 * markup and can stop mid-sentence. Taking the whole first paragraph and rendering it as
 * inline markdown gives clean prose with working links, and removing exactly that
 * paragraph from the body means it is not printed twice.
 */
export function splitLead(body: string): { lead: string; rest: string } {
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length || lines[i].startsWith("#") || lines[i].startsWith(">") || lines[i].startsWith("|")) {
    return { lead: "", rest: body }; // a heading, quote or table is not a lead
  }
  const start = i;
  while (i < lines.length && lines[i].trim()) i++;
  return { lead: lines.slice(start, i).join(" ").trim(), rest: lines.slice(i).join("\n") };
}

/** The lead, as inline HTML — no wrapping <p>, wikilinks still resolved. */
export function renderLead(md: string): string {
  return marked.parseInline(md.replace(/\[\[([a-z0-9-]+)\]\]/g, '<a href="/c/$1">$1</a>')) as string;
}

/** A whole concept file, frontmatter stripped — reviewers read prose, not YAML. */
export function renderConceptFile(markdown: string): string {
  return renderConcept(splitFrontmatter(markdown).body);
}

export { splitFrontmatter };
