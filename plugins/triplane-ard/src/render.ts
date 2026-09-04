import type { DiscoveryResult, RemoteTool } from "./types.ts";

/**
 * Turning a discovery into something a model reads well.
 *
 * Kept under ~40 lines of output because Codex truncates long tool results, and the trust
 * verdict must survive that truncation — it goes near the top for exactly that reason.
 */
export function renderDiscovery(d: DiscoveryResult): string {
  const c = d.catalog;
  const L: string[] = [];

  L.push(`${c.name}${c.description ? ` — ${c.description}` : ""}`);
  L.push(`origin        ${d.origin}`);
  L.push(`catalog       ${d.catalogUrl} (via ${d.via})`);
  if (d.redirects.length) L.push(`redirected    ${d.redirects.join(" → ")}`);
  L.push(`publisher     ${c.publisher?.name ?? "?"} <${c.publisher?.domain ?? "?"}>`);
  if (c.bundleHash) L.push(`bundle        ${c.bundleHash}${c.updatedAt ? ` · built ${c.updatedAt}` : ""}`);

  L.push(``);
  L.push(`TRUST: ${d.trust.level}`);
  L.push(`  proves: ${d.trust.proves}`);
  for (const n of d.trust.doesNotProve) L.push(`  does NOT prove: ${n}`);
  L.push(`  endpoint on the serving host: ${d.trust.endpointCheck}`);
  if (d.waived.length) {
    // A bypassed check must be visible in the result, or the next reader has no way to know
    // this site was accepted on a waiver rather than on its merits.
    L.push(`  ⚠ CHECKS WAIVED BY THE CALLER: ${d.waived.join(", ")} — say so when reporting this site.`);
  }
  if (d.endpointRewrittenFrom) {
    L.push(`  NOTE: advertised endpoint was ${d.endpointRewrittenFrom}, repointed at the loopback origin you asked for.`);
  }

  L.push(``);
  L.push(`CAPABILITIES`);
  const caps = [d.capabilities.mcp, d.capabilities.bundle, ...d.capabilities.other].filter(Boolean);
  for (const cap of caps) {
    const bits = [cap!.kind, cap!.transport, cap!.endpoint].filter(Boolean);
    L.push(`  - ${bits.join("  ")}`);
    if (cap!.tools?.length) L.push(`      advertises: ${cap!.tools.join(", ")}`);
  }
  if (!caps.length) L.push(`  (none)`);

  if (d.validation.warnings.length) {
    L.push(``);
    L.push(`CATALOG WARNINGS`);
    for (const w of d.validation.warnings) L.push(`  - ${w}`);
  }

  return L.join("\n");
}

export function renderTools(origin: string, live: RemoteTool[], advertised: string[] | undefined): string {
  const L = [`${origin} offers ${live.length} tool${live.length === 1 ? "" : "s"} right now:`];
  for (const t of live) L.push(`  - ${t.name}${t.description ? ` — ${t.description.split("\n")[0]}` : ""}`);

  if (advertised?.length) {
    const liveNames = new Set(live.map((t) => t.name));
    // A catalog that over-promises is itself a finding, so surface the delta both ways.
    const missing = advertised.filter((n) => !liveNames.has(n));
    const extra = live.map((t) => t.name).filter((n) => !advertised.includes(n));
    if (missing.length) L.push(`  ! advertised but NOT offered: ${missing.join(", ")}`);
    if (extra.length) L.push(`  ! offered but not advertised: ${extra.join(", ")}`);
    if (!missing.length && !extra.length) L.push(`  (matches what the catalog advertised)`);
  }
  return L.join("\n");
}
