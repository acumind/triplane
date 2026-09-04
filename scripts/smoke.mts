import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compileBundle, compileFiles, buildTools, createMcpHandler, buildAiCatalog, fsStore, githubStore, validateProposal, shortestPath, upstream } from "@triplane/engine/server";
import { listPageTools, executePageTool, registerWebmcpTools, PageToolUnavailable } from "@triplane/engine";
import { discover, validateAiCatalog, normalizeDomain, parseLlmsTxt, extractJsonRpc, ArdError, isPrivateHost, fetchText, McpHttpClient } from "@triplane/ard";
import { handleRpc } from "../plugins/triplane-ard/src/mcp-stdio.ts";
import { runTool, TOOL_DEFS } from "../plugins/triplane-ard/src/proxy-tools.ts";
import { SiteRegistry } from "../plugins/triplane-ard/src/registry.ts";
import { encodeLine, LineDecoder } from "../plugins/triplane-ard/src/stdio-codec.ts";
import { renderDiscovery } from "../plugins/triplane-ard/src/render.ts";
import { parseArgv } from "../plugins/triplane-ard/src/argv.ts";
import { pageTypeFor, sampleQuestion } from "../apps/web/lib/page";
import { conceptView, isRestricted, statusLine } from "../apps/web/lib/concept";
import { humanizeType, pluralizeType } from "../apps/web/lib/display";
import { splitLead, renderAnswer } from "../apps/web/lib/markdown";

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

// Every bundle in the repo must compile. Only the demo bundle was checked here, so a
// broken bundle reached CI's build step rather than the test that should have caught it —
// and there are four of them now, three of which the demo flips between live.
console.log("\n— every bundle compiles:");
for (const dir of readdirSync("bundles").filter((d) => statSync(join("bundles", d)).isDirectory())) {
  const { graph, issues } = compileBundle(join("bundles", dir));
  const errs = issues.filter((i) => i.level === "error");
  check(
    `bundles/${dir} — ${graph.nodes.length} concepts, ${graph.edges.length} edges`,
    errs.length === 0,
    errs.map((e) => `${e.file}: ${e.message}`).join(" | ")
  );
}

// One compiler, two front doors. A sandbox that previewed a bundle through a second,
// subtly different code path would show the user something the build would not produce.
console.log("\n— compileFiles (no filesystem):");
{
  const fromDisk = compileBundle("bundles/meridian");
  const files = fromDisk.graph.nodes.map((n) => ({
    path: n.path,
    content: readFileSync(join("bundles/meridian", n.path), "utf8")
  }));
  const inMemory = compileFiles(files);
  check("same bundle hash as reading the directory", inMemory.graph.bundleHash === fromDisk.graph.bundleHash);
  check("same concepts and edges", inMemory.graph.nodes.length === fromDisk.graph.nodes.length && inMemory.graph.edges.length === fromDisk.graph.edges.length);
  check("compiles nothing without complaint", compileFiles([]).graph.nodes.length === 0);

  const bad = compileFiles([
    { path: "a.md", content: "---\ntitle: No type\n---\n\nlinks to [[nowhere]]\n" },
    { path: "b.md", content: "---\nid: a\ntype: term\n---\n\nbody\n" },
    { path: "c.md", content: "---\nid: a\ntype: term\n---\n\nduplicate id\n" },
    { path: "lonely.md", content: "---\nid: lonely\ntype: term\n---\n\nnothing links here and it links nowhere\n" }
  ]);
  const msgs = bad.issues.map((i) => i.message).join(" | ");
  check("missing type is an error", msgs.includes("missing required frontmatter field: type"));
  check("a broken link is an error", msgs.includes("broken link"));
  check("a duplicate id is an error", msgs.includes("duplicate id"));
  check("an orphan warns rather than fails", bad.issues.some((i) => i.level === "warn" && i.message.includes("orphan node: lonely")));
  check("a duplicate id no longer crashes the compiler", bad.graph.nodes.length === 4);
}

// The GitHub store is the ONLY store that works in production — a serverless filesystem is
// read-only and the fs path does not exist there. It had never executed once. These stub
// fetch and assert the REQUESTS it makes, which is what catches a wrong request body.
console.log("\n— github store (stubbed transport):");
{
  const realFetch = globalThis.fetch;
  const calls: { method: string; url: string; body: any; headers: any }[] = [];
  const route = (url: string, method: string): any => {
    if (/\/contents\/.*missing\.md/.test(url) && method === "GET") return { status: 404, body: { message: "Not Found" } };
    if (/\/contents\//.test(url) && method === "GET") return { status: 200, body: { sha: "blob-sha-1", content: Buffer.from("hi").toString("base64") } };
    if (/\/contents\//.test(url)) return { status: 200, body: {} };
    if (/\/git\/ref\//.test(url)) return { status: 200, body: { object: { sha: "base-sha" } } };
    if (/\/git\/refs/.test(url)) return { status: 201, body: {} };
    if (/\/pulls\/\d+\/files/.test(url)) {
      const n = url.match(/pulls\/(\d+)/)![1];
      return { status: 200, body: n === "1"
        ? [{ filename: "bundles/meridian/metrics/x.md" }]
        : [{ filename: "bundles/dhruva/products/y.md" }] };
    }
    if (/\/pulls\?/.test(url)) return { status: 200, body: [
      { number: 1, head: { ref: "proposal/aaa" }, html_url: "u1", title: "mine", created_at: "t" },
      { number: 2, head: { ref: "proposal/bbb" }, html_url: "u2", title: "another bundle", created_at: "t" },
      { number: 3, head: { ref: "feature/x" }, html_url: "u3", title: "not a proposal", created_at: "t" }
    ] };
    if (/\/pulls$/.test(url)) return { status: 201, body: { number: 7, html_url: "pr-url", created_at: "t" } };
    if (/\/trees\//.test(url)) return { status: 200, body: { tree: [
      { type: "blob", path: "README.md" },
      { type: "blob", path: "docs/notes.md" },
      { type: "blob", path: "bundles/meridian/metrics/churn.md" },
      { type: "blob", path: "bundles/dhruva/products/mg.md" }
    ] } };
    return { status: 200, body: {} };
  };
  (globalThis as any).fetch = async (url: string, init: any = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url: String(url), body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers ?? {} });
    const r = route(String(url), method);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  };

  try {
    const store = githubStore("acumind/triplane", "main", "bundles/meridian");

    check("list() returns only this bundle, bundle-relative",
      (await store.list()).join() === "metrics/churn.md");

    calls.length = 0;
    await store.propose({ path: "metrics/churn.md", content: "x", message: "edit" });
    const put = calls.find((c) => c.method === "PUT")!;
    check("propose() sends the blob sha when the file exists", put?.body?.sha === "blob-sha-1");
    check("propose() writes under the bundle root", put?.url.includes("/contents/bundles/meridian/metrics/churn.md"));

    calls.length = 0;
    await store.propose({ path: "metrics/missing.md", content: "x", message: "new" });
    check("propose() omits sha for a new file", !("sha" in (calls.find((c) => c.method === "PUT")!.body ?? {})));

    const queue = await store.listProposals();
    check("listProposals() keeps proposals touching this bundle", queue.length === 1 && queue[0].id === "1");
    check("listProposals() drops another bundle's proposal", !queue.some((p) => p.id === "2"));
    check("listProposals() ignores non-proposal branches", !queue.some((p) => p.id === "3"));
    check("listProposals() reports bundle-relative paths", queue[0].paths?.join() === "metrics/x.md");

    check("every request carries a user-agent", calls.length > 0 && calls.every((c) => Boolean(c.headers["user-agent"])));
  } finally {
    globalThis.fetch = realFetch;
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

  // Answers are model-authored markdown carrying citations the panel turns into links.
  const cited = renderAnswer("Cites [users].\n\n```\ndiagram [users]\n```\n\n`code [users]`", new Set(["users"]));
  check("answer markdown is rendered, not printed", cited.includes("<p>") && cited.includes("<pre>"));
  check("a citation in prose becomes a link", (cited.match(/class="cite"/g) ?? []).length === 1);
  check("citations do not leak into code blocks", !cited.includes("&lt;sup&gt;"));
  check("unknown ids are left alone", !renderAnswer("[not-a-concept]", new Set(["users"])).includes("cite"));
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


// ---------------------------------------------------------------------------------------
// ARD client. Network-free: every block drives a stubbed fetch, so these assert the
// DECISIONS (what is refused, and why) rather than that a live site happens to be up.
// ---------------------------------------------------------------------------------------

/** Build a fetch stub from a url→{status, body, headers} table. */
type StubHit = { status: number; body: string; headers?: Record<string, string> } | null;
const stubFetch = (routes: (url: string, init: any) => StubHit | Promise<StubHit>) =>
  (async (url: any, init: any = {}) => {
    const hit = await routes(String(url), init);
    if (!hit) return new Response("nope", { status: 404 });
    return new Response(hit.body, { status: hit.status, headers: hit.headers ?? { "content-type": "application/json" } });
  }) as unknown as typeof fetch;

const catalogFor = (origin: string, publisherDomain = origin, mcpOrigin = origin, bundleOrigin = origin) =>
  JSON.stringify({
    $schema: "x", name: "Test Site", description: "d",
    publisher: { name: "Test Publisher", domain: publisherDomain },
    updatedAt: new Date().toISOString(), bundleHash: "abc123",
    capabilities: [
      { kind: "knowledge-bundle", format: "okf", endpoint: `${bundleOrigin}/api/bundle`, contentTypes: ["text/markdown"] },
      { kind: "mcp-server", transport: "streamable-http", endpoint: `${mcpOrigin}/api/mcp`, tools: ["search_concepts"] }
    ]
  });

console.log("\n— ARD: input normalization:");
{
  check("bare host becomes https", normalizeDomain("example.com").origin === "https://example.com");
  check("explicit scheme is honoured", normalizeDomain("http://example.com").origin === "http://example.com");
  check("path and query are stripped", normalizeDomain("https://example.com/c/x?y=1").origin === "https://example.com");
  check("port survives", normalizeDomain("example.com:8443").origin === "https://example.com:8443");
  const local = normalizeDomain("localhost:3000");
  check("loopback tries http first", local.origin === "http://localhost:3000");
  check("a public host is never downgraded to http", normalizeDomain("example.com").candidates.every((c) => c.startsWith("https://")));
  let bad = "";
  try { normalizeDomain("ftp://x"); } catch (e: any) { bad = e.code; }
  check("non-http scheme is refused", bad === "ARD_BAD_INPUT", bad);
  check("private ranges are recognised", isPrivateHost("169.254.169.254") && isPrivateHost("10.0.0.1") && !isPrivateHost("example.com"));
}

console.log("\n— ARD: catalog validation (the same code build.ts runs):");
{
  const ok = validateAiCatalog(JSON.parse(catalogFor("https://a.example")));
  check("a well-formed catalog passes", ok.errors.length === 0, ok.errors.join("; "));

  // Deliberately a WARNING, not an error: whether a publisher-less catalog is acceptable is
  // a trust decision, and the trust layer owns it. Failing here made "missing-publisher"
  // unreachable and reported the wrong error code.
  const missingDomain = validateAiCatalog({ name: "n", publisher: { name: "p" }, capabilities: [] });
  check("publisher.domain missing is a warning, not a schema error",
    missingDomain.errors.length === 0 && missingDomain.warnings.some((w) => w.includes("publisher.domain")));
  check("capabilities must be an array", validateAiCatalog({ name: "n", publisher: { name: "p", domain: "d" } }).errors.some((e) => e.includes("capabilities")));
  check("mcp-server without endpoint is an error", validateAiCatalog({ name: "n", publisher: { name: "p", domain: "d" }, capabilities: [{ kind: "mcp-server" }] }).errors.some((e) => e.includes("endpoint")));
  check("a relative endpoint is an error", validateAiCatalog({ name: "n", publisher: { name: "p", domain: "d" }, capabilities: [{ kind: "mcp-server", endpoint: "/api/mcp" }] }).errors.some((e) => e.includes("absolute")));
  const unknown = validateAiCatalog({ name: "n", publisher: { name: "p", domain: "d" }, capabilities: [{ kind: "future-thing", endpoint: "https://x.example/y" }] });
  check("an unknown capability kind warns but does not fail", unknown.errors.length === 0 && unknown.warnings.some((w) => w.includes("unknown kind")));

  // The round trip that makes the "validated during build" claim mean something: every
  // bundle's real catalog is checked by the very validator a stranger's client uses.
  const cfgMod: any = await import("../triplane.config.js");
  const cfg = cfgMod.default?.default ?? cfgMod.default ?? cfgMod;
  for (const dir of readdirSync("bundles")) {
    const { graph: g } = compileBundle(join("bundles", dir));
    const res = validateAiCatalog(buildAiCatalog(cfg, g, buildTools()));
    check(`bundles/${dir} produces a valid catalog`, res.errors.length === 0, res.errors.join("; "));
  }
}

console.log("\n— ARD: discovery and the trust verdict:");
{
  const origin = "https://good.example";
  const found = await discover(origin, {
    fetchImpl: stubFetch((url) => (url === `${origin}/.well-known/ai-catalog.json` ? { status: 200, body: catalogFor(origin) } : null))
  });
  check("well-known discovery works", found.via === "well-known" && found.origin === origin);
  check("same host over https is verified-origin", found.trust.level === "verified-origin", found.trust.level);
  check("the verdict always says what it does NOT prove", found.trust.doesNotProve.length >= 3);
  check("endpoint on the serving host passes the second check", found.trust.endpointCheck === "same-host");
  check("both capabilities are surfaced, not just mcp", !!found.capabilities.mcp && !!found.capabilities.bundle);

  // llms.txt stops being decorative: it is a real discovery path with a test behind it.
  const llmsOrigin = "https://pointer.example";
  const viaLlms = await discover(llmsOrigin, {
    fetchImpl: stubFetch((url) => {
      // No catalog at the well-known path — llms.txt names one somewhere else, which is
      // the case this fallback exists for.
      if (url === `${llmsOrigin}/.well-known/ai-catalog.json`) return { status: 404, body: "no" };
      if (url === `${llmsOrigin}/llms.txt`) return { status: 200, body: `# Site\n## Agent access\n- Catalog: ${llmsOrigin}/ard/catalog.json\n`, headers: { "content-type": "text/plain" } };
      if (url === `${llmsOrigin}/ard/catalog.json`) return { status: 200, body: catalogFor(llmsOrigin) };
      return null;
    })
  });
  check("llms.txt is a working fallback path", viaLlms.via === "llms.txt");
  check("parseLlmsTxt finds the catalog link", parseLlmsTxt("- Catalog: https://x.example/.well-known/ai-catalog.json").catalogUrl === "https://x.example/.well-known/ai-catalog.json");

  // A catalog claiming to be someone else is the attack the publisher check exists for.
  const liar = "https://liar.example";
  let code = "";
  try {
    await discover(liar, { fetchImpl: stubFetch((url) => (url.startsWith(liar) && url.includes("ai-catalog") ? { status: 200, body: catalogFor(liar, "https://bank.example") } : null)) });
  } catch (e: any) { code = e.code; }
  check("a foreign publisher domain is REFUSED", code === "ARD_PUBLISHER_UNVERIFIED", code);

  // ...and refusing is waivable, explicitly, per call.
  const waived = await discover(liar, {
    allow: ["unverified-publisher"],
    fetchImpl: stubFetch((url) => (url.startsWith(liar) && url.includes("ai-catalog") ? { status: 200, body: catalogFor(liar, "https://bank.example") } : null))
  });
  check("an explicit waiver unblocks it and the verdict still says foreign-origin", waived.trust.level === "foreign-origin");

  // A catalog pointing at somebody else's server is the other half of the same attack.
  const offsite = "https://offsite.example";
  let code2 = "";
  try {
    await discover(offsite, { fetchImpl: stubFetch((url) => (url.startsWith(offsite) && url.includes("ai-catalog") ? { status: 200, body: catalogFor(offsite, offsite, "https://elsewhere.example") } : null)) });
  } catch (e: any) { code2 = e.code; }
  check("an offsite endpoint is REFUSED", code2 === "ARD_ENDPOINT_OFFSITE", code2);

  let code3 = "";
  try {
    await discover("https://nothing.example", { fetchImpl: stubFetch(() => ({ status: 404, body: "no" })) });
  } catch (e: any) { code3 = e.code; }
  check("a site with no catalog reports ARD_NOT_FOUND", code3 === "ARD_NOT_FOUND", code3);

  let code4 = "";
  try {
    await discover("https://spa.example", { fetchImpl: stubFetch((url) => (url.includes("ai-catalog") ? { status: 200, body: "<!doctype html><html>", headers: { "content-type": "text/html" } } : null)) });
  } catch (e: any) { code4 = e.code; }
  check("an SPA answering 200 with HTML reports ARD_NOT_JSON", code4 === "ARD_NOT_JSON", code4);
}

console.log("\n— ARD: MCP-over-HTTP client framing:");
{
  check("a plain JSON response parses", extractJsonRpc('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}', "application/json").result.ok === true);
  // A compliant server may answer a POST with an SSE frame; a JSON-only client breaks there.
  check(
    "a text/event-stream response parses",
    extractJsonRpc('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n', "text/event-stream").result.ok === true
  );
  check("an empty body is null, not a crash", extractJsonRpc("", "application/json") === null);
}

console.log("\n— ARD: the proxy cannot route around the publisher's exposure decision:");
{
  // The stub IS the real handler, so this asserts against production behaviour rather than
  // a mock of it. Two independent gates have to hold: the server's, and the proxy's.
  const origin = "https://real.example";
  const handler = createMcpHandler(buildTools(), graph, "smoke");
  const fetchImpl = stubFetch((url, init) => {
    if (url.includes("ai-catalog")) return { status: 200, body: catalogFor(origin) };
    if (url === `${origin}/api/mcp`) {
      return handler(JSON.parse(String(init.body))).then((res: any) => ({
        status: res === null ? 202 : 200,
        body: res === null ? "" : JSON.stringify(res)
      }));
    }
    return null;
  });

  const registry = new SiteRegistry();
  const ctxTools = { registry, fetchImpl };
  const listed = await runTool("ard_tools", { domain: origin }, ctxTools);
  const listedText = listed.content[0].text;
  check("proxy lists exactly the four global read tools", ["search_concepts", "get_concept", "get_join_path", "explain_metric"].every((n) => listedText.includes(n)));
  check("no write tool is listed", !listedText.includes("propose_concept"));
  check("no ui tool is listed", !listedText.includes("highlight_subgraph"));

  for (const blocked of ["propose_concept", "highlight_subgraph", "compare_metrics"]) {
    const res = await runTool("ard_call", { domain: origin, tool: blocked, arguments: {} }, ctxTools);
    check(`proxy refuses ${blocked}`, res.isError === true && res.content[0].text.startsWith("ARD_TOOL_NOT_OFFERED"));
  }

  const good = await runTool("ard_call", { domain: origin, tool: "search_concepts", arguments: { query: "a" } }, ctxTools);
  check("an offered tool round-trips through the proxy", good.isError !== true && good.content[0].text.includes("— via "));
  check("results carry a provenance line naming the bundle", good.content[0].text.includes("abc123"));

  const sites = await runTool("ard_sites", {}, ctxTools);
  check("ard_sites reports the session's discoveries", sites.content[0].text.includes(origin));
}

console.log("\n— ARD: stdio framing and the server:");
{
  check("encodeLine ends in exactly one newline", encodeLine({ a: 1 }) === '{"a":1}\n');
  const d = new LineDecoder();
  check("a partial line is buffered", d.push('{"a":').length === 0);
  check("the completed line then decodes", d.push('1}\n').length === 1);
  check("\\r\\n is tolerated and blanks ignored", new LineDecoder().push('{"a":1}\r\n\n{"b":2}\n').length === 2);

  const ctxS = { registry: new SiteRegistry() };
  const init: any = handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, ctxS);
  check("initialize echoes a supported protocol version", init.result.protocolVersion === "2025-06-18");
  check("initialize names the server", init.result.serverInfo.name === "triplane-ard");
  check("initialize ships instructions for the host", typeof init.result.instructions === "string" && init.result.instructions.length > 40);
  check("a notification gets no reply", handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, ctxS) === null);
  const list: any = handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ctxS);
  check("tools/list returns the five ard_ tools", list.result.tools.length === 5 && list.result.tools.every((t: any) => t.name.startsWith("ard_")));
  check("every tool declares an object inputSchema", TOOL_DEFS.every((t: any) => t.inputSchema?.type === "object"));
  check("no ard_ tool accepts an endpoint argument", !JSON.stringify(TOOL_DEFS).includes('"endpoint"'));
  const unknownMethod: any = handleRpc({ jsonrpc: "2.0", id: 3, method: "nope" }, ctxS);
  check("an unknown method is -32601", unknownMethod.error.code === -32601);
  const unknownTool: any = await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "ard_nope" } }, ctxS);
  check("an unknown ard_ tool is -32602", unknownTool.error.code === -32602);
}

console.log("\n— ARD: SSRF and offsite endpoints (regression: the guard was once inverted):");
{
  // THE regression test. The guard must follow what the USER asked for. Deriving it from the
  // endpoint being fetched let a catalog naming a private address switch its own guard off,
  // and ard_read would then fetch it.
  const evil = "https://evil.example";
  const metadata = "http://169.254.169.254";
  let code = "";
  try {
    await discover(evil, {
      fetchImpl: stubFetch((url) =>
        url.includes("ai-catalog") ? { status: 200, body: catalogFor(evil, evil, evil, metadata) } : null)
    });
  } catch (e: any) { code = e.code; }
  check("a public catalog advertising a private-address endpoint is REFUSED", code === "ARD_ENDPOINT_OFFSITE", code);

  // Even waived past the offsite check, the fetch itself must still refuse the private target:
  // two independent guards, because the first one is the one that was wrong before.
  const registry = new SiteRegistry();
  const fetchImpl = stubFetch((url) =>
    url.includes("ai-catalog") ? { status: 200, body: catalogFor(evil, evil, evil, metadata) }
      : url.startsWith(metadata) ? { status: 200, body: "SECRET" } : null);
  const read = await runTool("ard_read", { domain: evil, allow: ["offsite-endpoint"] }, { registry, fetchImpl });
  check("even waived, ard_read still refuses a private address",
    read.isError === true && read.content[0].text.startsWith("ARD_BLOCKED_TARGET"), read.content[0].text.slice(0, 60));
  check("the private body never reaches the caller", !read.content[0].text.includes("SECRET"));

  // The offsite check must cover EVERY capability, not just the mcp one it happens to want.
  const site = "https://site.example";
  let code2 = "";
  try {
    await discover(site, {
      fetchImpl: stubFetch((url) =>
        url.includes("ai-catalog") ? { status: 200, body: catalogFor(site, site, site, "https://other.example") } : null)
    });
  } catch (e: any) { code2 = e.code; }
  check("a same-host mcp endpoint does not excuse an offsite bundle endpoint", code2 === "ARD_ENDPOINT_OFFSITE", code2);
}

console.log("\n— ARD: waivers are real (they were advertised before they worked):");
{
  const http = "http://plain.example";
  let code = "";
  try {
    await discover(http, { fetchImpl: stubFetch((url) => (url.includes("ai-catalog") ? { status: 200, body: catalogFor(http) } : null)) });
  } catch (e: any) { code = e.code; }
  check("plain http on a public host is REFUSED", code === "ARD_PUBLISHER_UNVERIFIED", code);

  const waived = await discover(http, {
    allow: ["insecure-transport"],
    fetchImpl: stubFetch((url) => (url.includes("ai-catalog") ? { status: 200, body: catalogFor(http) } : null))
  });
  check("insecure-transport actually waives it", waived.trust.level === "unverified-local");
  check("the waiver is echoed back in the result", waived.waived.includes("insecure-transport"));
  check("and rendered, so a reader cannot miss it", renderDiscovery(waived).includes("CHECKS WAIVED"));

  let bad = "";
  try { await discover("https://x.example", { allow: ["banana" as any] }); } catch (e: any) { bad = e.code; }
  check("an unknown waiver is refused rather than ignored", bad === "ARD_BAD_INPUT", bad);

  // localhost over http is the local-instance case and stays allowed, labelled.
  const local = "http://localhost:3000";
  const loopback = await discover("localhost:3000", {
    fetchImpl: stubFetch((url) => (url.startsWith(local) && url.includes("ai-catalog") ? { status: 200, body: catalogFor(local) } : null))
  });
  check("loopback over http is still allowed", loopback.trust.level === "unverified-local");
  check("and its private target is permitted because the user asked for it", loopback.allowPrivate === true);
}

console.log("\n— ARD: redirects are walked by hand, guarded and capped:");
{
  const start = "https://a.example";
  const end = "https://b.example";
  const hops = stubFetch((url) => {
    if (url === `${start}/.well-known/ai-catalog.json`) return { status: 302, body: "", headers: { location: `${end}/catalog.json` } };
    if (url === `${end}/catalog.json`) return { status: 200, body: catalogFor(end) };
    return null;
  });
  const moved = await discover(start, { fetchImpl: hops });
  check("a redirect is followed", moved.origin === end);
  check("trust is judged against the host that ACTUALLY served it", moved.trust.servingHost === "b.example");
  check("the hop is reported, not hidden", moved.redirects.length > 0);

  // A redirect that lands somewhere guardTarget refuses must not be followed.
  let blocked = "";
  try {
    await fetchText(`${start}/x`, {
      fetchImpl: stubFetch((url) => (url === `${start}/x` ? { status: 302, body: "", headers: { location: "http://169.254.169.254/" } } : { status: 200, body: "SECRET" }))
    });
  } catch (e: any) { blocked = e.code; }
  check("a redirect into a private address is blocked mid-chain", blocked === "ARD_BLOCKED_TARGET", blocked);

  let looped = "";
  try {
    await fetchText(`${start}/loop`, {
      fetchImpl: stubFetch((url) => ({ status: 302, body: "", headers: { location: `${start}/loop?${url.length}` } }))
    });
  } catch (e: any) { looped = e.code; }
  check("an endless redirect chain hits the cap", looped === "ARD_TOO_MANY_REDIRECTS", looped);
}

console.log("\n— ARD: transports we cannot speak are refused, not POSTed at:");
{
  const o = "https://stdio.example";
  const body = JSON.stringify({
    name: "S", publisher: { name: "P", domain: o }, capabilities: [{ kind: "mcp-server", transport: "stdio", endpoint: `${o}/api/mcp` }]
  });
  let code = "";
  try { await discover(o, { fetchImpl: stubFetch((url) => (url.includes("ai-catalog") ? { status: 200, body } : null)) }); }
  catch (e: any) { code = e.code; }
  check("a transport this client cannot speak is refused", code === "ARD_TRANSPORT_UNSUPPORTED", code);
}

console.log("\n— ARD: the remaining tool handlers and rendering:");
{
  const origin = "https://render.example";
  const files = JSON.stringify({ format: "okf", files: ["a.md", "b/c.md"] });
  const fetchImpl = stubFetch((url) => {
    if (url.includes("ai-catalog")) return { status: 200, body: catalogFor(origin) };
    if (url === `${origin}/api/bundle`) return { status: 200, body: files };
    if (url.startsWith(`${origin}/api/bundle?path=`)) return { status: 200, body: "# doc", headers: { "content-type": "text/markdown" } };
    return null;
  });
  const registry = new SiteRegistry();
  const ctxR = { registry, fetchImpl };

  const disc = await runTool("ard_discover", { domain: origin }, ctxR);
  check("ard_discover renders the publisher and the trust verdict", disc.content[0].text.includes("TRUST: verified-origin"));
  check("ard_discover always states what the check does NOT prove", disc.content[0].text.includes("does NOT prove"));

  const listing = await runTool("ard_read", { domain: origin }, ctxR);
  check("ard_read with no path lists the bundle", listing.content[0].text.includes("b/c.md"));
  const doc = await runTool("ard_read", { domain: origin, path: "a.md" }, ctxR);
  check("ard_read with a path returns the document", doc.content[0].text.startsWith("# doc"));
  check("ard_read carries provenance", doc.content[0].text.includes("— via "));
  const escape = await runTool("ard_read", { domain: origin, path: "../secrets.md" }, ctxR);
  check("ard_read refuses a path that escapes the bundle", escape.isError === true);

  const empty = await runTool("ard_sites", {}, { registry: new SiteRegistry(), fetchImpl });
  check("ard_sites says so when nothing is discovered", empty.content[0].text.includes("No sites discovered"));
}

console.log("\n— ARD: registry behaviour:");
{
  const reg = new SiteRegistry();
  const origin = "https://reg.example";
  const mk = (hash: string, endpoint = `${origin}/api/mcp`): any => ({
    origin, requestedOrigin: origin, catalogUrl: "", via: "well-known", redirects: [],
    catalog: { name: "n", publisher: { name: "p", domain: origin }, capabilities: [], bundleHash: hash },
    validation: { warnings: [] }, trust: {}, capabilities: { mcp: { kind: "mcp-server", endpoint }, other: [] },
    allowPrivate: false, waived: []
  });

  const first = reg.put(mk("h1"));
  reg.cacheTools(first, [{ name: "t1" }]);
  check("a same-hash re-discovery keeps the cached tool list", reg.put(mk("h1")).tools?.length === 1);
  check("a changed bundleHash drops it", reg.put(mk("h2")).tools === undefined);

  check("find matches a bare host", !!reg.find("reg.example"));
  check("find matches a full origin", !!reg.find(origin));
  check("find matches a URL with a path", !!reg.find(`${origin}/c/thing`));
  check("find does not match a different host", !reg.find("other.example"));

  // Keyed by endpoint: an origin-keyed cache kept talking to a moved endpoint.
  const recA = reg.put(mk("h3", `${origin}/api/mcp`));
  const clientA = reg.client(recA, {});
  const recB = reg.put(mk("h3", `${origin}/api/mcp-v2`));
  check("a moved endpoint gets a new client", reg.client(recB, {}) !== clientA);
}

console.log("\n— ARD: MCP client session handling and error shapes:");
{
  const ep = "https://sess.example/api/mcp";
  const seen: (string | null)[] = [];
  const client = new McpHttpClient(ep, {
    fetchImpl: stubFetch((url, init) => {
      seen.push((init.headers ?? {})["mcp-session-id"] ?? null);
      const req = JSON.parse(String(init.body));
      if (req.method === "initialize") {
        return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { protocolVersion: "2025-06-18" } }), headers: { "content-type": "application/json", "mcp-session-id": "sess-1" } };
      }
      if (req.method === "tools/list") {
        return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { tools: [{ name: "x" }] } }) };
      }
      return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: -32602, message: "Unknown tool: nope" } }) };
    })
  });
  await client.initialize();
  await client.listTools();
  check("a session id issued by the server is captured and replayed", seen.some((h) => h === "sess-1"));

  let code = "";
  try { await client.callTool("nope", {}); } catch (e: any) { code = e.code; }
  // A JSON-RPC error arrives as HTTP 200; reading .result blindly is the classic crash.
  check("a JSON-RPC error becomes ARD_TOOL_ERROR, not a crash", code === "ARD_TOOL_ERROR", code);

  let http = "";
  try {
    await new McpHttpClient(ep, { fetchImpl: stubFetch(() => ({ status: 503, body: "down" })) }).initialize();
  } catch (e: any) { http = e.code; }
  check("a non-2xx becomes ARD_RPC_FAILED", http === "ARD_RPC_FAILED", http);
}

console.log("\n— ARD: CLI argument parsing:");
{
  const a = parseArgv(["discover", "example.com"]);
  check("plain positionals parse", a.cmd === "discover" && a.domain === "example.com");
  // The bug: a flag before the domain used to be taken AS the domain.
  const b = parseArgv(["discover", "--allow", "offsite-endpoint", "example.com"]);
  check("a flag before the domain is not swallowed", b.domain === "example.com" && b.allow[0] === "offsite-endpoint");
  const c = parseArgv(["call", "example.com", "search", "{}"]);
  check("trailing positionals survive", c.args.length === 2);
  let bad = "";
  try { parseArgv(["discover", "x", "--allow", "banana"]); } catch (e: any) { bad = e.code; }
  check("the CLI refuses an unknown waiver too", bad === "ARD_BAD_INPUT", bad);
}

console.log("\n— ARD: the launch contract (this is what silently rots):");
{
  const root = "plugins/triplane-ard";
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  check("the ARD package has zero runtime dependencies", Object.keys(pkg.dependencies ?? {}).length === 0,
    "standalone launch depends on this: node cannot resolve bare specifiers without node_modules");
  for (const manifest of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const m = JSON.parse(readFileSync(join(root, manifest), "utf8"));
    const args: string[] = m.mcpServers?.ard?.args ?? [];
    const rel = args.find((a) => a.includes("ard-mcp.mjs"))?.replace(/^\$\{CLAUDE_PLUGIN_ROOT\}\//, "").replace(/^\.\//, "");
    check(`${manifest} points at a launcher that exists`, !!rel && existsSync(join(root, rel)), rel ?? "no arg");
  }

  // A host launches this from ITS cwd, not ours. The first version resolved `tsx` as a bare
  // specifier, which worked from the repo and failed everywhere else — and a failed MCP
  // server reports only "Connection closed", so nothing upstream says why.
  const { spawnSync } = await import("node:child_process");
  const elsewhere = mkdtempSync(join(tmpdir(), "triplane-ard-cwd-"));
  const proc = spawnSync(process.execPath, [join(process.cwd(), root, "bin/ard-mcp.mjs")], {
    cwd: elsewhere,
    input: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n',
    encoding: "utf8",
    timeout: 30_000
  });
  let names: string[] = [];
  try {
    names = JSON.parse((proc.stdout ?? "").split("\n").find((l) => l.trim())!).result.tools.map((t: any) => t.name);
  } catch { /* leave empty — the check below reports it */ }
  check("the launcher works from an unrelated cwd", names.length === 5,
    (proc.stderr ?? "").split("\n").slice(0, 2).join(" ") || "no output");
  rmSync(elsewhere, { recursive: true, force: true });
}

console.log(failures ? `\n✗ ${failures} smoke check(s) failed` : "\n✓ all smoke checks passed");
// Set the code and let node exit on its own. process.exit() abandons whatever stdout has
// not flushed, which is invisible on a terminal (synchronous) and silently truncates the
// log the moment output is redirected to a file or a CI pipe.
process.exitCode = failures ? 1 : 0;
