import { ArdError } from "./errors.ts";
import { fetchText, parseJsonOrThrow } from "./http.ts";
import { parseLlmsTxt } from "./llms-txt.ts";
import { hostOf, isLoopbackHost, isPrivateHost, normalizeDomain, sameRegistrableSuffix } from "./origin.ts";
import { validateAiCatalog } from "./catalog-schema.ts";
import type { AiCatalog, Capability, DiscoveryResult, TrustVerdict, Waiver } from "./types.ts";

/**
 * Discovery: a bare domain in, a checked catalog out.
 *
 * The part worth caring about is what happens when a check fails. Refusing is the feature —
 * a client that discovers everything successfully has not demonstrated a publisher check,
 * it has demonstrated a fetch.
 */

export interface DiscoverOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Explicit, per-call. Never a default, and always echoed back in the result. */
  allow?: Waiver[];
}

const WELL_KNOWN = "/.well-known/ai-catalog.json";

/** What this client can actually talk. Anything else is refused rather than POSTed at. */
const SPEAKABLE_TRANSPORTS = new Set(["streamable-http", "http"]);

export const WAIVERS: Waiver[] = ["unverified-publisher", "offsite-endpoint", "insecure-transport"];

export async function discover(domain: string, opts: DiscoverOptions = {}): Promise<DiscoveryResult> {
  const { origin: firstOrigin, candidates } = normalizeDomain(domain);

  // Reject an unknown waiver rather than ignoring it: silently dropping one means the caller
  // believes a check was bypassed when it was not.
  for (const w of opts.allow ?? []) {
    if (!WAIVERS.includes(w)) {
      throw new ArdError("ARD_BAD_INPUT", `Unknown waiver ${JSON.stringify(w)}.`, { known: WAIVERS });
    }
  }
  const allow = new Set(opts.allow ?? []);

  // The user asking for localhost is what makes private targets legal; a catalog asking
  // for them is not. That distinction is the whole SSRF guard, and it is decided HERE —
  // once, from the input — so no later code can re-derive it from an advertised endpoint.
  const allowPrivate = candidates.some((c) => isPrivateHost(hostOf(c)));
  const base = { fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs, allowPrivate };

  let offsiteOffenders: Capability[] = [];
  const tried: string[] = [];
  let found: { url: string; text: string; finalUrl: string; via: "well-known" | "llms.txt" } | null = null;
  let lastUnreachable: ArdError | null = null;

  for (const candidate of candidates) {
    const wellKnown = `${candidate}${WELL_KNOWN}`;
    tried.push(wellKnown);
    try {
      const res = await fetchText(wellKnown, base);
      if (res.status === 200) {
        found = { url: wellKnown, text: res.text, finalUrl: res.finalUrl, via: "well-known" };
        break;
      }
    } catch (e) {
      if (e instanceof ArdError && e.code === "ARD_UNREACHABLE") lastUnreachable = e;
      else throw e;
    }

    // Fallback: llms.txt is far more widely deployed and may name the catalog.
    const llms = `${candidate}/llms.txt`;
    tried.push(llms);
    try {
      const res = await fetchText(llms, { ...base, accept: "text/plain" });
      if (res.status === 200) {
        const pointers = parseLlmsTxt(res.text);
        if (pointers.catalogUrl) {
          tried.push(pointers.catalogUrl);
          const cat = await fetchText(pointers.catalogUrl, base);
          if (cat.status === 200) {
            found = { url: pointers.catalogUrl, text: cat.text, finalUrl: cat.finalUrl, via: "llms.txt" };
            break;
          }
        } else if (pointers.mcpUrl && !allow.has("unverified-publisher")) {
          // An MCP endpoint with no catalog means no publisher metadata at all, so there
          // is nothing to verify. Refuse by default rather than connect blind — and honour
          // the waiver this error names, or the retry it suggests fails identically.
          throw new ArdError(
            "ARD_PUBLISHER_UNVERIFIED",
            `${llms} names an MCP endpoint but no catalog, so there is no publisher to check.`,
            { endpoint: pointers.mcpUrl, waiveWith: "unverified-publisher" }
          );
        }
      }
    } catch (e) {
      if (e instanceof ArdError && e.code === "ARD_UNREACHABLE") lastUnreachable = e;
      else throw e;
    }
  }

  if (!found) {
    if (lastUnreachable) throw lastUnreachable;
    throw new ArdError("ARD_NOT_FOUND", `No ARD catalog at ${firstOrigin}.`, { tried });
  }

  const parsed = parseJsonOrThrow(found.url, found.text);
  const validation = validateAiCatalog(parsed);
  if (validation.errors.length) {
    throw new ArdError("ARD_INVALID_CATALOG", `${found.url} is not a valid ai-catalog.json.`, validation.errors);
  }
  const catalog = parsed as AiCatalog;

  // Everything below is judged against the host that ACTUALLY served the catalog.
  const servingOrigin = new URL(found.finalUrl).origin;
  const servingHost = hostOf(servingOrigin);
  const scheme = new URL(servingOrigin).protocol.replace(":", "");
  const redirects = found.finalUrl !== found.url ? [found.url, found.finalUrl] : [];

  const capabilities = splitCapabilities(catalog.capabilities ?? []);
  const all = () => [capabilities.mcp, capabilities.bundle, ...capabilities.other].filter(Boolean) as Capability[];

  let endpointRewrittenFrom: string | undefined;
  let endpointCheck: TrustVerdict["endpointCheck"] = "n/a";

  // EVERY advertised endpoint is checked, not just the one we happen to want. A same-host
  // mcp-server alongside an offsite knowledge-bundle used to pass here, and ard_read would
  // then go fetch the offsite one.
  const withEndpoint = all().filter((c) => c.endpoint);
  if (withEndpoint.length) {
    const offsite = withEndpoint.filter((c) => hostOf(c.endpoint!) !== servingHost);

    if (!offsite.length) {
      endpointCheck = "same-host";
    } else if (isLoopbackHost(servingHost)) {
      // The TRIPLANE_DOMAIN-unset case: a local build bakes its production origin into the
      // catalog. Repointing at the origin we actually reached is safe here BECAUSE the user
      // asked for loopback — but it is reported, never silent.
      endpointRewrittenFrom = offsite.map((c) => c.endpoint!).join(", ");
      endpointCheck = "same-host";
      for (const cap of all()) {
        if (cap.endpoint) cap.endpoint = rebase(cap.endpoint, servingOrigin);
      }
    } else {
      endpointCheck = "offsite";
      offsiteOffenders = offsite;
    }
  }

  const trust = judge({ catalog, servingHost, scheme, endpointCheck });

  if (trust.level === "missing-publisher" && !allow.has("unverified-publisher")) {
    throw new ArdError("ARD_PUBLISHER_UNVERIFIED", `${found.url} names no publisher domain.`, {
      waiveWith: "unverified-publisher"
    });
  }
  if (trust.level === "foreign-origin" && !allow.has("unverified-publisher")) {
    throw new ArdError(
      "ARD_PUBLISHER_UNVERIFIED",
      `Catalog served by ${servingHost} claims publisher domain ${trust.claimedHost}.`,
      {
        servingHost,
        claimedHost: trust.claimedHost,
        why: "Only the host serving the catalog can vouch for it. A different claimed domain proves nothing.",
        waiveWith: "unverified-publisher"
      }
    );
  }
  if (endpointCheck === "offsite" && !allow.has("offsite-endpoint")) {
    throw new ArdError(
      "ARD_ENDPOINT_OFFSITE",
      `${servingHost} advertises ${offsiteOffenders.length} endpoint(s) on another host.`,
      {
        endpoints: offsiteOffenders.map((c) => ({ kind: c.kind, endpoint: c.endpoint })),
        why: "A catalog that points elsewhere can aim this agent at a server its publisher does not control.",
        waiveWith: "offsite-endpoint"
      }
    );
  }
  // Plain HTTP to a public host means anyone on the path can rewrite the whole catalog, so
  // the trust label alone is not enough — refuse unless the caller says otherwise.
  if (scheme !== "https" && !isLoopbackHost(servingHost) && !allow.has("insecure-transport")) {
    throw new ArdError(
      "ARD_PUBLISHER_UNVERIFIED",
      `${found.finalUrl} was served over ${scheme}, not https.`,
      {
        why: "Without TLS there is nothing vouching for this host, so the publisher claim is unverifiable and forgeable in transit.",
        waiveWith: "insecure-transport"
      }
    );
  }
  // A capability we cannot actually speak is better refused than silently POSTed at.
  const transport = capabilities.mcp?.transport;
  if (transport && !SPEAKABLE_TRANSPORTS.has(transport)) {
    throw new ArdError("ARD_TRANSPORT_UNSUPPORTED", `This client speaks HTTP; the catalog advertises "${transport}".`, {
      endpoint: capabilities.mcp?.endpoint,
      speaks: [...SPEAKABLE_TRANSPORTS]
    });
  }

  return {
    origin: servingOrigin,
    requestedOrigin: firstOrigin,
    catalogUrl: found.finalUrl,
    via: found.via,
    redirects,
    catalog,
    validation: { warnings: validation.warnings },
    trust,
    capabilities,
    ...(endpointRewrittenFrom ? { endpointRewrittenFrom } : {}),
    allowPrivate,
    waived: [...allow]
  };
}

function rebase(endpoint: string, origin: string): string {
  const u = new URL(endpoint);
  const o = new URL(origin);
  u.protocol = o.protocol;
  u.host = o.host;
  return u.toString();
}

function splitCapabilities(caps: Capability[]): DiscoveryResult["capabilities"] {
  const out: DiscoveryResult["capabilities"] = { other: [] };
  for (const c of caps) {
    if (c.kind === "mcp-server" && !out.mcp) out.mcp = { ...c };
    else if (c.kind === "knowledge-bundle" && !out.bundle) out.bundle = { ...c };
    else out.other.push({ ...c });
  }
  return out;
}

function judge(a: {
  catalog: AiCatalog;
  servingHost: string;
  scheme: string;
  endpointCheck: TrustVerdict["endpointCheck"];
}): TrustVerdict {
  const claimedRaw = a.catalog.publisher?.domain?.trim();
  const claimedHost = claimedRaw ? safeHost(claimedRaw) : null;

  const doesNotProve = [
    `that the organisation named "${a.catalog.publisher?.name ?? "?"}" exists or consented to this — only that this host published it`,
    "that the content is accurate; a publisher can be honest about who they are and wrong about everything else",
    "anything cryptographic: there is no signature and no key, so a host compromise forges this trivially"
  ];

  if (!claimedHost) {
    return {
      level: "missing-publisher",
      claimedHost: null,
      servingHost: a.servingHost,
      scheme: a.scheme,
      endpointCheck: a.endpointCheck,
      proves: "Nothing. The catalog names no publisher domain, so there is no claim to check.",
      doesNotProve
    };
  }

  const level: TrustVerdict["level"] =
    claimedHost === a.servingHost
      ? a.scheme === "https"
        ? "verified-origin"
        : "unverified-local"
      : sameRegistrableSuffix(claimedHost, a.servingHost)
        ? "related-origin"
        : "foreign-origin";

  const proves =
    level === "verified-origin"
      ? `Whoever controls DNS and the TLS certificate for ${a.servingHost} asserts this identity. Exactly as strong as HTTPS for that host, and no stronger.`
      : level === "unverified-local"
        ? `Nothing, cryptographically: this was served over ${a.scheme} from ${a.servingHost}. Fine for a local instance, worthless against a network attacker.`
        : level === "related-origin"
          ? `${a.servingHost} and the claimed ${claimedHost} share a registrable domain by a naive two-label comparison — not a public-suffix list.`
          : `Nothing. ${a.servingHost} served a catalog claiming to be ${claimedHost}; only ${claimedHost} could vouch for that.`;

  if (level === "related-origin") {
    doesNotProve.push("that the two hosts are truly the same registrable domain — this check has no public-suffix list");
  }

  return { level, claimedHost, servingHost: a.servingHost, scheme: a.scheme, endpointCheck: a.endpointCheck, proves, doesNotProve };
}

function safeHost(domain: string): string | null {
  try {
    return hostOf(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`);
  } catch {
    return null;
  }
}
