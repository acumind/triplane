
/**
 * The ai-catalog.json shape check, with two consumers on purpose.
 *
 * A stranger's client runs it against a catalog it just fetched; `build.ts` runs it against
 * the catalog it is about to write. Same code both directions — which is the only way the
 * claim "validated against the spec at build time" is worth anything. It lives here rather
 * than in the engine because it belongs to the *format*, not to the producer.
 *
 * Errors mean refuse. Warnings mean say something and carry on: a catalog carrying a
 * capability kind we have never heard of is a healthy ecosystem, not a fault.
 */

export interface CatalogCheck {
  errors: string[];
  warnings: string[];
}

const KNOWN_TRANSPORTS = new Set(["streamable-http", "http", "sse", "stdio"]);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isAbsoluteHttpUrl = (v: unknown): boolean => {
  if (typeof v !== "string" || !v) return false;
  try {
    return /^https?:$/.test(new URL(v).protocol);
  } catch {
    return false;
  }
};

export function validateAiCatalog(json: unknown): CatalogCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObj(json)) return { errors: ["catalog is not a JSON object"], warnings };

  if (typeof json.name !== "string" || !json.name.trim()) errors.push("name: required, non-empty string");
  if (typeof json.description !== "string") warnings.push("description: missing");
  if (typeof json.$schema !== "string") warnings.push("$schema: missing");
  if (typeof json.bundleHash !== "string") warnings.push("bundleHash: missing (cache invalidation is weaker without it)");

  if (json.updatedAt !== undefined) {
    if (typeof json.updatedAt !== "string" || Number.isNaN(Date.parse(json.updatedAt))) {
      warnings.push("updatedAt: not an ISO-8601 timestamp");
    }
  } else {
    warnings.push("updatedAt: missing");
  }

  const pub = json.publisher;
  if (!isObj(pub)) {
    errors.push("publisher: required object");
  } else {
    if (typeof pub.name !== "string" || !pub.name.trim()) errors.push("publisher.name: required, non-empty string");
    // A warning, not an error: whether a publisher-less catalog is acceptable is a TRUST
    // decision, and the trust layer has a verdict for it ("missing-publisher") plus a waiver.
    // Failing here first made that verdict unreachable and reported the wrong error.
    if (typeof pub.domain !== "string" || !pub.domain.trim()) {
      warnings.push("publisher.domain: missing — nothing can vouch for this catalog");
    }
  }

  const caps = json.capabilities;
  if (!Array.isArray(caps)) {
    errors.push("capabilities: required array");
  } else {
    caps.forEach((c, i) => {
      const at = `capabilities[${i}]`;
      if (!isObj(c)) return void errors.push(`${at}: not an object`);
      if (typeof c.kind !== "string" || !c.kind.trim()) return void errors.push(`${at}.kind: required, non-empty string`);

      if (c.endpoint !== undefined && !isAbsoluteHttpUrl(c.endpoint)) {
        errors.push(`${at}.endpoint: must be an absolute http(s) URL`);
      }
      if (c.kind === "mcp-server" && c.endpoint === undefined) {
        errors.push(`${at}.endpoint: required for kind "mcp-server"`);
      }
      if (c.kind === "knowledge-bundle" && c.endpoint === undefined) {
        errors.push(`${at}.endpoint: required for kind "knowledge-bundle"`);
      }
      if (c.transport !== undefined && (typeof c.transport !== "string" || !KNOWN_TRANSPORTS.has(c.transport))) {
        warnings.push(`${at}.transport: unrecognised (${String(c.transport)})`);
      }
      if (c.tools !== undefined && (!Array.isArray(c.tools) || c.tools.some((t) => typeof t !== "string"))) {
        warnings.push(`${at}.tools: expected an array of strings`);
      }
      if (!["mcp-server", "knowledge-bundle"].includes(c.kind)) {
        warnings.push(`${at}.kind: unknown kind "${c.kind}" — ignored, not an error`);
      }
    });
  }

  return { errors, warnings };
}
