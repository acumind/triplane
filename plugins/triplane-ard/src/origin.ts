import { ArdError } from "./errors.ts";

/**
 * Turning what a person types into an origin we are willing to fetch.
 *
 * The scheme rule is the security-relevant one: if the caller gave a scheme we honour it,
 * and if they did not we try https ONLY — except for loopback names, where http is also
 * allowed so a local instance stays demoable. Silently downgrading an arbitrary domain to
 * http is exactly the hole a discovery client must not have.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  return LOOPBACK_HOSTS.has(h) || h.endsWith(".localhost") || h.endsWith(".local");
}

/**
 * Link-local, private and unique-local ranges. A hosted catalog that points an agent at
 * 169.254.169.254 is trying to read a cloud metadata service through us.
 */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/:\d+$/, "");
  if (isLoopbackHost(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(h)) return true;
  if (/^fe80:/i.test(h)) return true;
  return false;
}

export interface Normalized {
  /** The first candidate — what we try first. */
  origin: string;
  /** Every origin worth trying, in order. More than one only for loopback. */
  candidates: string[];
}

export function normalizeDomain(input: string): Normalized {
  const raw = (input ?? "").trim();
  if (!raw) throw new ArdError("ARD_BAD_INPUT", "No domain given.");
  if (/\s/.test(raw)) throw new ArdError("ARD_BAD_INPUT", `Not a domain: ${JSON.stringify(raw)}`);

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  if (hasScheme && !/^https?:\/\//i.test(raw)) {
    throw new ArdError("ARD_BAD_INPUT", `Only http and https are supported, got ${raw.split("://")[0]}:`);
  }

  const build = (candidate: string): string => {
    let u: URL;
    try {
      u = new URL(candidate);
    } catch {
      throw new ArdError("ARD_BAD_INPUT", `Could not parse ${JSON.stringify(input)} as a domain or URL.`);
    }
    if (!u.hostname) throw new ArdError("ARD_BAD_INPUT", `No host in ${JSON.stringify(input)}.`);
    // .well-known is origin-scoped: any path, query or fragment is noise here.
    return u.origin;
  };

  if (hasScheme) {
    const origin = build(raw);
    return { origin, candidates: [origin] };
  }

  const httpsOrigin = build(`https://${raw}`);
  const host = new URL(httpsOrigin).host;
  if (isLoopbackHost(host)) {
    const httpOrigin = build(`http://${raw}`);
    return { origin: httpOrigin, candidates: [httpOrigin, httpsOrigin] };
  }
  return { origin: httpsOrigin, candidates: [httpsOrigin] };
}

export const hostOf = (url: string): string => new URL(url).host.toLowerCase();

/**
 * Naive registrable-domain comparison — deliberately naive, and labelled as such wherever
 * it is used. A correct implementation needs the public suffix list, which would be a
 * dependency, and this package has none by design.
 */
export function sameRegistrableSuffix(a: string, b: string): boolean {
  const parts = (h: string) => h.toLowerCase().replace(/:\d+$/, "").split(".").filter(Boolean);
  const pa = parts(a);
  const pb = parts(b);
  if (pa.length < 2 || pb.length < 2) return false;
  return pa.slice(-2).join(".") === pb.slice(-2).join(".");
}
