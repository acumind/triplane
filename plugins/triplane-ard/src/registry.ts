import { McpHttpClient } from "./mcp-http-client.ts";
import type { DiscoveryResult, RemoteTool, SiteRecord } from "./types.ts";

/**
 * What this process has discovered, for as long as it lives.
 *
 * Session-scoped and in memory on purpose. A bookmark file or a seeded list of known sites
 * would quietly recreate the thing this whole exercise exists to disprove — that the agent
 * already knew where to look.
 */
const TOOLS_TTL_MS = 10 * 60 * 1000;

export class SiteRegistry {
  private sites = new Map<string, SiteRecord>();
  private clients = new Map<string, McpHttpClient>();

  /**
   * Anything the caller might type: a bare host, an origin, or a URL with a path. Normalised
   * the same way on both sides, including the scheme — matching on host alone made
   * `http://x` and `https://x` collide on lookup while storing as two separate records.
   */
  find(domainOrOrigin: string): SiteRecord | undefined {
    const key = (v: string) => {
      const lower = v.trim().toLowerCase();
      try {
        return new URL(/^https?:\/\//.test(lower) ? lower : `https://${lower}`).origin;
      } catch {
        return lower.replace(/\/+$/, "");
      }
    };
    const needle = key(domainOrOrigin);
    const bare = needle.replace(/^https?:\/\//, "");
    for (const rec of this.sites.values()) {
      for (const candidate of [rec.origin, rec.discovery.requestedOrigin]) {
        const k = key(candidate);
        if (k === needle || k.replace(/^https?:\/\//, "") === bare) return rec;
      }
    }
    return undefined;
  }

  put(discovery: DiscoveryResult): SiteRecord {
    const previous = this.sites.get(discovery.origin);
    const endpoint = discovery.capabilities.mcp?.endpoint;
    const rec: SiteRecord = { origin: discovery.origin, discovery, endpoint, discoveredAt: Date.now() };

    // A changed bundle hash means the published tool list may have changed with it — the
    // catalog already carries exactly the field needed to notice. Drop the cached TOOLS,
    // which is what the hash actually describes; the connection is fine either way.
    if (previous && previous.discovery.catalog.bundleHash === discovery.catalog.bundleHash) {
      rec.tools = previous.tools;
      rec.toolsFetchedAt = previous.toolsFetchedAt;
    }
    this.sites.set(discovery.origin, rec);
    return rec;
  }

  /**
   * Keyed by endpoint, not origin: a re-discovery can move the endpoint while the origin and
   * bundle hash stay put, and an origin-keyed cache would keep talking to the old one.
   */
  client(rec: SiteRecord, opts: ConstructorParameters<typeof McpHttpClient>[1]): McpHttpClient {
    if (!rec.endpoint) throw new Error("no mcp endpoint for this site");
    const existing = this.clients.get(rec.endpoint);
    if (existing) return existing;
    const c = new McpHttpClient(rec.endpoint, opts);
    this.clients.set(rec.endpoint, c);
    return c;
  }

  /** Drop a client whose session the server has forgotten, so the next call re-initialises. */
  dropClient(rec: SiteRecord): void {
    if (rec.endpoint) this.clients.delete(rec.endpoint);
  }

  cacheTools(rec: SiteRecord, tools: RemoteTool[]): void {
    rec.tools = tools;
    rec.toolsFetchedAt = Date.now();
  }

  freshTools(rec: SiteRecord): RemoteTool[] | undefined {
    if (!rec.tools || !rec.toolsFetchedAt) return undefined;
    return Date.now() - rec.toolsFetchedAt < TOOLS_TTL_MS ? rec.tools : undefined;
  }

  all(): SiteRecord[] {
    return [...this.sites.values()].sort((a, b) => a.discoveredAt - b.discoveredAt);
  }
}
