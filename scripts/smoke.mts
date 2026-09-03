import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compileBundle, buildTools, createMcpHandler, buildAiCatalog, fsStore, validateProposal, shortestPath, upstream } from "@triplane/engine/server";
import { listPageTools, executePageTool, registerWebmcpTools, PageToolUnavailable } from "@triplane/engine";
import { pageTypeFor, sampleQuestion } from "../apps/web/lib/page";
import { conceptView, isRestricted, statusLine } from "../apps/web/lib/concept";
import { humanizeType, pluralizeType } from "../apps/web/lib/display";
import { splitLead } from "../apps/web/lib/markdown";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail && !ok ? ` — ${detail}` : ""}`);
};

const { graph, issues } = compileBundle("bundles/meridian");
console.log("lint:", issues.length ? issues : "clean");

const tools = buildTools();
const ctx = { graph };
const run = async (name: string, args: any, extra: Record<string, unknown> = {}) => {
  const t = tools.find((x) => x.name === name)!;
  const r = await t.handler(args, { ...ctx, ...extra } as any);
  return r.content[0].text;
};

console.log("\n— search_concepts('weekly active users'):");
console.log(await run("search_concepts", { query: "weekly active users" }));

console.log("\n— get_join_path(weekly-active-users → users):");
console.log(await run("get_join_path", { from: "weekly-active-users", to: "users" }));

console.log("\n— explain_metric(churn-rate) upstream ids:");
const em = JSON.parse(await run("explain_metric", { id: "churn-rate" }));
console.log(em.upstream.map((u: any) => `${u.id}(${u.type})`).join(" ← "));

console.log("\n— MCP handler round-trip:");
const mcp = createMcpHandler(tools, graph, "smoke");
const listed: string[] = (await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" })).result.tools.map((t: any) => t.name);
console.log(JSON.stringify(listed));
const call = await mcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_join_path", arguments: { from: "churn-rate", to: "events" } } });
console.log(call.result.content[0].text.replace(/\n/g, " "));

// Guardrail 4 + D8: only global read tools cross the browser gate onto plane 3.
console.log("\n— plane-3 exposure:");
const writeUi = tools.filter((t) => t.kind !== "read").map((t) => t.name);
const pageScoped = tools.filter((t) => t.scope !== "global").map((t) => t.name);
check("write/ui tools excluded from MCP", !writeUi.some((n) => listed.includes(n)), listed.join(","));
check("page-scoped tools excluded from MCP", !pageScoped.some((n) => listed.includes(n)), listed.join(","));
check(
  "page-scoped tools excluded from ai-catalog",
  !JSON.stringify(buildAiCatalog({ brand: { name: "smoke", accent: "#000" }, publisher: { name: "s", domain: "s.example" }, planes: { webmcp: { enabled: true }, ard: { enabled: true, mcp: true } }, bundle: "bundles/meridian", store: { kind: "fs" } }, graph, tools)).includes(pageScoped[0])
);
const unknown = await mcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: pageScoped[0], arguments: {} } });
check("calling a page-scoped tool over MCP is a JSON-RPC error", Boolean(unknown.error));

// Graph algorithms, on synthetic fixtures rather than the demo bundle: these assertions
// are about traversal, and tying them to bundle content would make them break whenever a
// concept is edited. shortestPath is the get_join_path demo beat.
console.log("\n— graph traversal:");
{
  const g = (edges: [string, string, string][]): any => ({
    nodes: [...new Set(edges.flatMap(([a, , b]) => [a, b]))].map((id) => ({ id })),
    edges: edges.map(([from, rel, to]) => ({ from, to, rel }))
  });
  const chain = g([["a", "source", "b"], ["b", "source", "c"], ["c", "source", "d"]]);
  const ids = (p: any) => p?.map((h: any) => h.id).join("→") ?? null;

  check("path to self is a single hop", ids(shortestPath(chain, "a", "a")) === "a");
  check("adjacent nodes", ids(shortestPath(chain, "a", "b")) === "a→b");
  check("multi-hop path", ids(shortestPath(chain, "a", "d")) === "a→b→c→d");
  check("edges traverse in reverse too", ids(shortestPath(chain, "d", "a")) === "d→c→b→a");
  check("reverse hops are labelled as such", shortestPath(chain, "d", "a")?.[1]?.rel.includes("rev") === true);
  check("no path returns null", shortestPath(g([["a", "r", "b"], ["c", "r", "d"]]), "a", "d") === null);
  check("unknown node returns null", shortestPath(chain, "a", "nope") === null);

  const diamond = g([["a", "source", "b"], ["a", "source", "c"], ["b", "source", "d"], ["c", "source", "d"]]);
  check("shortest of two equal routes is 3 hops", shortestPath(diamond, "a", "d")?.length === 3);

  const cyclic = g([["a", "source", "b"], ["b", "source", "c"], ["c", "source", "a"]]);
  check("a cycle terminates rather than looping", ids(shortestPath(cyclic, "a", "c")) === "a→c");

  check("upstream is the transitive closure", upstream(chain, "a").join(",") === "b,c,d");
  check("upstream follows edge direction only", upstream(chain, "d").length === 0);
  check(
    "upstream ignores relationships outside the lineage set",
    upstream(g([["a", "source", "b"], ["b", "mentions", "c"]]), "a").join(",") === "b"
  );
  check("upstream honours a custom relationship set", upstream(g([["a", "mentions", "b"]]), "a", ["mentions"]).join(",") === "b");
  check("upstream terminates on a cycle", upstream(cyclic, "a").sort().join(",") === "b,c");
  check("upstream never includes its own start node", !upstream(cyclic, "a").includes("a"));
}

// D2: the sidebar and the WebMCP registrar must agree on which tools exist per page.
// They disagree by offering the model a tool the browser never registered — an
// "unknown tool" failure that only shows up mid-demo, on a metric page.
console.log("\n— page-scoped tool selection:");
const offered = (pathname: string) => {
  const pageType = pageTypeFor(graph, pathname);
  return buildTools()
    .filter((t) => t.kind !== "write" && (t.scope === "global" || t.scope.pageType === pageType))
    .map((t) => t.name);
};
const metricPage = graph.nodes.find((n) => n.type === "metric")!;
const tablePage = graph.nodes.find((n) => n.type === "table")!;
check("pageTypeFor resolves a concept page", pageTypeFor(graph, `/c/${metricPage.id}`) === "metric");
check("pageTypeFor is undefined off a concept page", pageTypeFor(graph, "/") === undefined);
check("pageTypeFor decodes an escaped id", pageTypeFor(graph, `/c/${encodeURIComponent(metricPage.id)}`) === "metric");
check("page-scoped tool offered on its own page type", offered(`/c/${metricPage.id}`).includes("compare_metrics"));
check("page-scoped tool withheld on another page type", !offered(`/c/${tablePage.id}`).includes("compare_metrics"));
check("page-scoped tool withheld on the home page", !offered("/").includes("compare_metrics"));
check("write tools never offered to the sidebar agent", !offered("/").includes("propose_concept"));
check("ui tools ARE offered in-page (the plane-2/3 asymmetry)", offered("/").includes("highlight_subgraph"));
check("sample question is drawn from the bundle", sampleQuestion(graph).includes(metricPage.title.toLowerCase()));
check("sample question adapts to a bundle with no metric", !sampleQuestion(compileBundle("bundles/triplane-docs").graph).includes("computed"));

// D14: the WebMCP registry is an origin-trial surface whose descriptor shape is not
// settled. listPageTools() feeds a model API directly, where a missing schema is a hard
// 400 — so it must normalize every spelling it might be handed, not assume one.
console.log("\n— WebMCP descriptor normalization:");
const withRegistry = async (mc: unknown) => {
  (globalThis as any).document = { modelContext: mc };
  try {
    return await listPageTools();
  } finally {
    delete (globalThis as any).document;
  }
};
const shape = { name: "search_concepts", description: "d" };
check("inputSchema spelling", (await withRegistry({ getTools: () => [{ ...shape, inputSchema: { type: "object" } }] }))[0]?.inputSchema !== undefined);
check("input_schema spelling", (await withRegistry({ getTools: () => [{ ...shape, input_schema: { type: "object" } }] }))[0]?.inputSchema !== undefined);
check("parameters spelling", (await withRegistry({ getTools: () => [{ ...shape, parameters: { type: "object" } }] }))[0]?.inputSchema !== undefined);
check("listTools() enumerator", (await withRegistry({ listTools: () => [{ ...shape, inputSchema: {} }] })).length === 1);
check("plain tools property", (await withRegistry({ tools: [{ ...shape, inputSchema: {} }] })).length === 1);
check("async getTools()", (await withRegistry({ getTools: async () => [{ ...shape, inputSchema: {} }] })).length === 1);
check("a throwing registry falls back rather than crashing", (await withRegistry({ getTools: () => { throw new Error("boom"); } })).length === 0);
check("a non-array registry is ignored", (await withRegistry({ getTools: () => ({ nope: true }) })).length === 0);
check("nameless descriptors are dropped", (await withRegistry({ getTools: () => [{ inputSchema: {} }, { ...shape, inputSchema: {} }] })).length === 1);
check("no registry at all yields nothing", (await listPageTools()).length === 0);

// D15: the execute convention is unsettled too — some builds want the RegisteredTool
// object, some the name, some put execute() on the descriptor. Whichever it is, the
// user's question must not dead-end.
console.log("\n— WebMCP execute shapes:");
const ok = { content: [{ type: "text", text: "ran" }] };
const desc = { name: "search_concepts", inputSchema: {} };
const viaRegistry = async (mc: any) => {
  (globalThis as any).document = { modelContext: mc };
  try {
    return await executePageTool("search_concepts", {});
  } finally {
    delete (globalThis as any).document;
  }
};
check("executeTool(RegisteredTool, args)", (await viaRegistry({
  getTools: () => [desc],
  executeTool: (t: any) => (typeof t === "object" ? ok : (() => { throw new TypeError("not of type RegisteredTool"); })())
})) === ok);
check("descriptor.execute(args)", (await viaRegistry({ getTools: () => [{ ...desc, execute: async () => ok }] })) === ok);
check("executeTool(name, args)", (await viaRegistry({ getTools: () => [], executeTool: (n: any) => (typeof n === "string" ? ok : undefined) })) === ok);
check(
  "a registry that matches no shape reports PageToolUnavailable so the caller can fall back",
  await viaRegistry({ getTools: () => [desc], executeTool: () => { throw new TypeError("nope"); } })
    .then(() => false)
    .catch((e) => e instanceof PageToolUnavailable)
);
check(
  "an abort is surfaced, never retried as a shape mismatch",
  await (async () => {
    const ac = new AbortController();
    ac.abort();
    (globalThis as any).document = { modelContext: { getTools: () => [desc], executeTool: () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; } } };
    try {
      await executePageTool("search_concepts", {}, ac.signal);
      return false;
    } catch (e: any) {
      return e.name === "AbortError";
    } finally {
      delete (globalThis as any).document;
    }
  })()
);

// D16: the native implementation has NO enumerator and its executeTool() accepts only
// the RegisteredTool handle that registerTool() returned. Registering is the only way to
// learn either fact, so the handles must be kept rather than discarded.
console.log("\n— native WebMCP (registerTool handles, no enumerator):");
{
  const calls: any[] = [];
  const handles = new Map<string, any>();
  const native = {
    // Mirrors the observed build: returns a RegisteredTool, offers no getTools/listTools.
    registerTool(def: any) {
      const h = { __brand: "RegisteredTool", name: def.name, run: def.execute };
      handles.set(def.name, h);
      return h;
    },
    executeTool(t: any, args: any) {
      if (typeof t !== "object" || t?.__brand !== "RegisteredTool")
        throw new TypeError("Failed to execute 'executeTool' on 'ModelContext': The provided value is not of type 'RegisteredTool'.");
      calls.push(t.name);
      return t.run(args);
    }
  };
  (globalThis as any).document = { modelContext: native };
  try {
    const set = registerWebmcpTools(buildTools(), { graph } as any, "metric");
    const listed = await listPageTools();
    check("inventory recovered from registrations when no enumerator exists", listed.length === set.names.length && listed.length > 0);
    check("every listed tool carries a schema", listed.every((t) => typeof t.inputSchema === "object" && t.inputSchema !== null));
    check("page-scoped tool registered on a metric page", set.names.includes("compare_metrics"));
    const out: any = await executePageTool("search_concepts", { query: "churn" });
    check("executeTool accepts the RegisteredTool handle", calls.includes("search_concepts"));
    check("and returns the MCP-shaped result", Array.isArray(out?.content) && typeof out.content[0]?.text === "string");
    set.unregisterAll();
    check("unregistering clears the inventory", (await listPageTools()).length === 0);
    check(
      "executing an unregistered tool reports PageToolUnavailable",
      await executePageTool("search_concepts", {}).then(() => false).catch((e) => e instanceof PageToolUnavailable)
    );
  } finally {
    delete (globalThis as any).document;
  }
}

// The concept view model. It reads free-form OKF frontmatter, so the contract that matters
// is: declared fields are surfaced, and a bundle that declares nothing still renders.
// isRestricted in particular has already caused one silent failure.
console.log("\n— concept view model:");
{
  const node = (id: string, type: string, frontmatter: any = {}, body = "") => ({
    id, type, title: id, path: `${type}s/${id}.md`, frontmatter, excerpt: "", body
  });
  const build = (nodes: any[], edges: any[] = []) => ({ nodes, edges, index: {}, bundleHash: "h", builtAt: "" }) as any;

  // A bundle that declares nothing must still produce a correct page.
  const bare = build([node("thing", "table")]);
  const bv = conceptView(bare, bare.nodes[0]);
  check("bare concept is Published by default", bv.status === "Published");
  check("bare concept ids itself", bv.conceptId === "thing");
  check("bare concept has only its type as a tag", bv.tags.join() === "Table");
  check("bare concept declares no governance", !bv.owner && !bv.steward && !bv.version && !bv.usage);
  check("bare concept has no columns, changes or lineage", !bv.columns.length && !bv.changes.length && !bv.upstream.length);

  const rich = build([
    node("users", "table", {
      status: "Draft", version: "14", verified: "12 Aug", owner: "CDP", steward: "A. Kaur",
      next_review: "in 68 days", concept_id: "tbl.users.v14",
      classifications: ["Contains PII", "Confidential"],
      sources: [{ kicker: "Source", label: "crm.customers" }],
      columns: [{ name: "email", type: "string", classification: "PII", notes: "masked" }],
      usage: { humanReads: 5 },
      changes: [{ version: "v14", summary: "added a column", author: "A", at: "12 Aug" }]
    }),
    node("policy-x", "policy"),
    node("metric-x", "metric")
  ], [
    { from: "metric-x", to: "users", rel: "source" },   // downstream: something derives from us
    { from: "users", to: "policy-x", rel: "governs" },  // a policy applies
    { from: "policy-x", to: "users", rel: "mentions" }  // inbound, but not lineage
  ]);
  const rv = conceptView(rich, rich.nodes[0]);
  check("declared status wins over the default", rv.status === "Draft");
  check("governance fields are surfaced", rv.owner === "CDP" && rv.steward === "A. Kaur" && rv.version === "14");
  check("declared concept id wins", rv.conceptId === "tbl.users.v14");
  check("classifications join the type as tags", rv.tags.join() === "Table,Contains PII,Confidential");
  check("columns are read with their classification", rv.columns[0]?.classification === "PII");
  check("declared sources become upstream", rv.upstream.length === 1 && rv.upstream[0].label === "crm.customers");
  check("a governing policy is its own lineage column", rv.policies.length === 1 && rv.policies[0].policy === true);
  check("downstream comes from inbound lineage edges", rv.downstream.length === 1 && rv.downstream[0].label === "metric-x");
  check("references list every inbound edge, lineage or not", rv.references.length === 2);
  check("changes and usage are surfaced", rv.changes[0]?.version === "v14" && rv.usage?.humanReads === 5);

  // Derived upstream is the fallback when a bundle declares no sources.
  const derived = build([node("a", "metric"), node("b", "table")], [{ from: "a", to: "b", rel: "source" }]);
  check("upstream falls back to outbound lineage edges", conceptView(derived, derived.nodes[0]).upstream[0]?.label === "b");

  check("statusLine omits what is not declared", statusLine(bv) === "Published");
  check("statusLine joins what is", statusLine(rv) === "Draft · v14 · verified 12 Aug");

  check("Confidential is restricted", isRestricted(["Table", "Confidential"]));
  check("Restricted and Secret too", isRestricted(["Restricted"]) && isRestricted(["top secret"]));
  check("PII alone is not restriction", !isRestricted(["Table", "Contains PII"]));
  check("nothing classified restricts nothing", !isRestricted([]) && !isRestricted());

  check("humanizeType reads a type id", humanizeType("join-path") === "Join path");
  check("pluralizeType handles y → ies", pluralizeType("policy") === "Policies");
  check("pluralizeType handles s/x/ch → es", pluralizeType("class") === "Classes");
  check("pluralizeType is otherwise plain", pluralizeType("table") === "Tables");

  check("splitLead takes the whole first paragraph", splitLead("one\ntwo\n\nrest").lead === "one two");
  check("splitLead leaves the rest intact", splitLead("one\n\nrest of it").rest.trim() === "rest of it");
  check("a heading is not a lead", splitLead("# Title\n\nbody").lead === "");
  check("a blockquote is not a lead", splitLead("> quoted\n\nbody").lead === "");
}

// D6: proposals are linted in the agent's loop, before anything is written.
console.log("\n— propose_concept validation:");
const good = "---\nid: retention-rate\ntype: metric\ntitle: Retention Rate\n---\n\nShare of [[cohort]] still active.\n";
check("escaping path rejected", validateProposal({ path: "../../etc/passwd.md", markdown: good }).issues.length > 0);
check("absolute path rejected", validateProposal({ path: "/tmp/x.md", markdown: good }).issues.length > 0);
check("non-markdown path rejected", validateProposal({ path: "metrics/x.txt", markdown: good }).issues.length > 0);
check("missing frontmatter rejected", validateProposal({ path: "metrics/x.md", markdown: "# no frontmatter" }).issues.length > 0);
check("missing type rejected", validateProposal({ path: "metrics/x.md", markdown: "---\ntitle: X\n---\n\nbody\n" }).issues.length > 0);
check("valid proposal accepted", validateProposal({ path: "metrics/retention-rate.md", markdown: good }).issues.length === 0);
const dup = JSON.parse(await run("propose_concept", { path: "metrics/churn-rate.md", markdown: good.replace("retention-rate", "churn-rate"), message: "dup" }, { store: fsStore(tmpdir()) }));
check("duplicate id rejected before it reaches the store", dup.proposed === false, JSON.stringify(dup));

// D4 + D5: the write plane round-trip, on a scratch bundle so bundles/ is never touched.
console.log("\n— fs store round-trip:");
const dir = mkdtempSync(join(tmpdir(), "triplane-smoke-"));
mkdirSync(join(dir, "metrics"), { recursive: true });
writeFileSync(join(dir, "metrics", "cohort.md"), "---\nid: cohort\ntype: term\ntitle: Cohort\n---\n\nA [[cohort]] of users.\n");
const store = fsStore(dir);
const p = await store.propose({ path: "metrics/retention-rate.md", content: good, message: "add retention rate" });
const queue = await store.listProposals();
check("listProposals returns the pending proposal", queue.length === 1 && queue[0].id === p.id);
check("proposal carries its message and paths", queue[0]?.message === "add retention rate" && queue[0]?.paths?.[0] === "metrics/retention-rate.md", JSON.stringify(queue[0]));
check("compile skips .proposals/", compileBundle(dir).graph.nodes.length === 1);
await store.approve(p.id);
check("approved file lands in the bundle", existsSync(join(dir, "metrics", "retention-rate.md")));
check("MESSAGE sidecar never enters the bundle", !existsSync(join(dir, "MESSAGE")));
check("approved proposal leaves the queue", (await store.listProposals()).length === 0);
check("rebuild sees the new concept", compileBundle(dir).graph.nodes.some((n) => n.id === "retention-rate"));
const p2 = await store.propose({ path: "metrics/bad.md", content: good, message: "to be rejected" });
await store.reject(p2.id);
check("rejected proposal leaves the queue", (await store.listProposals()).length === 0);
check("rejected file never lands in the bundle", !existsSync(join(dir, "metrics", "bad.md")));
rmSync(dir, { recursive: true, force: true });

console.log(failures ? `\n✗ ${failures} smoke check(s) failed` : "\n✓ all smoke checks passed");
process.exit(failures ? 1 : 0);
