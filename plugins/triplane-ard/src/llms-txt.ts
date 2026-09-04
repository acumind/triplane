/**
 * llms.txt as a fallback discovery path.
 *
 * A site with no /.well-known/ai-catalog.json may still point at one from llms.txt, which
 * is a far more widely adopted file. Supporting it is also what stops our own llms.txt
 * being decorative — nothing consumed it before this.
 */
export interface LlmsPointers {
  catalogUrl?: string;
  bundleUrl?: string;
  mcpUrl?: string;
}

const urlsIn = (line: string): string[] => line.match(/https?:\/\/[^\s)<>"'\]]+/g) ?? [];

export function parseLlmsTxt(text: string): LlmsPointers {
  const out: LlmsPointers = {};

  for (const line of text.split(/\r?\n/)) {
    const urls = urlsIn(line);
    if (!urls.length) continue;
    const label = line.toLowerCase();

    for (const u of urls) {
      // A direct hit on the filename beats any label.
      if (!out.catalogUrl && /ai-catalog\.json$/i.test(u)) out.catalogUrl = u;
      else if (!out.catalogUrl && /catalog/.test(label)) out.catalogUrl = u;

      if (!out.mcpUrl && (/\/mcp\b/.test(u) || /\bmcp\b/.test(label))) out.mcpUrl = u;
      if (!out.bundleUrl && (/\/bundle\b/.test(u) || /bundle/.test(label))) out.bundleUrl = u;
    }
  }

  return out;
}
