import { ArdError } from "./errors.ts";
import { isPrivateHost } from "./origin.ts";

/**
 * The only place this package touches the network.
 *
 * Bounded on purpose: a timeout, a size cap, a hand-walked redirect cap, and no credentials
 * ever. A discovery client runs inside somebody's coding agent, so every fetch here is a
 * request the model was able to influence — it gets treated accordingly.
 */

export const MAX_BYTES = 512 * 1024;
export const DEFAULT_TIMEOUT_MS = 8000;
export const MAX_REDIRECTS = 3;

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Set when the user's own input was loopback/private, which makes such targets legal. */
  allowPrivate?: boolean;
  accept?: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

export interface TextResponse {
  status: number;
  contentType: string;
  text: string;
  /** Post-redirect URL. Trust must be computed against this, never the requested URL. */
  finalUrl: string;
  headers: Headers;
}

export function guardTarget(url: string, allowPrivate: boolean): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ArdError("ARD_BAD_INPUT", `Not a URL: ${url}`);
  }
  if (!/^https?:$/.test(u.protocol)) {
    throw new ArdError("ARD_BAD_INPUT", `Refusing non-http(s) URL: ${url}`);
  }
  if (!allowPrivate && isPrivateHost(u.host)) {
    throw new ArdError(
      "ARD_BLOCKED_TARGET",
      `Refusing to fetch a private or link-local address: ${u.host}`,
      "A published catalog pointing at an internal address is trying to use this agent as a proxy into your network."
    );
  }
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<TextResponse> {
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  const allowPrivate = opts.allowPrivate ?? false;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const started = Date.now();

  // Redirects are followed BY HAND so every hop can be guarded and counted. `redirect:
  // "follow"` hands that to the platform, which will happily walk from a public host to a
  // private one — and leaves no way to enforce the cap this file claims to have.
  let current = url;
  let res!: Response;
  const chain: string[] = [];

  for (let hop = 0; ; hop++) {
    guardTarget(current, allowPrivate);
    if (hop > MAX_REDIRECTS) {
      throw new ArdError("ARD_TOO_MANY_REDIRECTS", `${url} redirected more than ${MAX_REDIRECTS} times.`, chain);
    }
    try {
      res = await doFetch(current, {
        method: opts.method ?? "GET",
        redirect: "manual",
        signal,
        headers: { accept: opts.accept ?? "application/json", ...(opts.headers ?? {}) },
        ...(opts.body === undefined ? {} : { body: opts.body })
      });
    } catch (e: any) {
      const why = e?.name === "TimeoutError" || e?.name === "AbortError" ? "timed out" : (e?.message ?? String(e));
      throw new ArdError("ARD_UNREACHABLE", `${current} — ${why} after ${Date.now() - started}ms`);
    }

    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) break;
    chain.push(current);
    current = new URL(location, current).toString();
  }

  // `res.url` is empty on a manually constructed Response (and on some stubs), so the URL we
  // actually ended at is the one we tracked, not one we hope the platform filled in.
  const finalUrl = current;

  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) {
    throw new ArdError("ARD_SIZE_LIMIT", `${url} declared ${declared} bytes (cap ${MAX_BYTES}).`);
  }

  const text = await res.text();
  if (text.length > MAX_BYTES) {
    throw new ArdError("ARD_SIZE_LIMIT", `${url} returned ${text.length} bytes (cap ${MAX_BYTES}).`);
  }

  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    text,
    finalUrl,
    headers: res.headers
  };
}

/**
 * Parse JSON without trusting content-type. Vercel and friends serve correct types, but a
 * discovery client meets every kind of host — and the interesting failure is an SPA
 * answering 200 with index.html, which this reports as ARD_NOT_JSON with the evidence.
 */
export function parseJsonOrThrow(url: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ArdError(
      "ARD_NOT_JSON",
      `${url} did not return JSON.`,
      text.slice(0, 120).replace(/\s+/g, " ").trim()
    );
  }
}
