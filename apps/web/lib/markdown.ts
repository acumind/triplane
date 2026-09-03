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

/**
 * An agent answer, rendered.
 *
 * The model replies in markdown — headings, lists, fenced blocks — and printing that as
 * plain text put literal "###" and backtick fences in front of the reader. Citations are
 * substituted for real links BEFORE the markdown pass, so they survive it as anchors the
 * panel can intercept, and only ids that exist in the graph are linked.
 */
export function renderAnswer(text: string, ids: Set<string>): string {
  // Substitute outside code only. A fenced block that happens to contain [an-id] would
  // otherwise have raw <sup><a …> escaped into it and shown to the reader as source —
  // which is exactly what a lineage diagram in a ``` block did.
  const cited = text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((chunk, i) =>
      i % 2 === 1
        ? chunk
        : chunk.replace(/\[([a-z0-9-]+)\]/g, (whole, id: string) =>
            ids.has(id) ? `<sup><a class="cite" href="/c/${id}" title="Cited concept: ${id}">${id}</a></sup>` : whole
          )
    )
    .join("");
  return marked.parse(cited) as string;
}
