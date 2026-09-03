import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import type { Graph } from "@triplane/engine";
import config from "../../../triplane.config";
import { GraphView } from "./GraphView";

/**
 * The product pitch, shown only on Triplane's own deployment.
 *
 * Every claim on this page is followed by the thing itself on this same origin — the
 * catalog, the MCP endpoint, the review queue. A page that asserted three planes without
 * letting you open all three would be a brochure; the point is that it is the software.
 */
function Plane({ n, title, who, children, links }: {
  n: string; title: string; who: string; children: React.ReactNode;
  links: { label: string; href: string }[];
}) {
  return (
    <section style={{ borderTop: "1px solid var(--line)", padding: "20px 0" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--hint)" }}>{n}</span>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-.015em" }}>{title}</h2>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--hint)" }}>{who}</span>
      </div>
      <p style={{ margin: "8px 0 12px", color: "var(--ink-body)", maxWidth: "62ch" }}>{children}</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {links.map((l) => (
          <a key={l.href} className="chip-outline" href={l.href} style={{ textDecoration: "none", fontSize: 12 }}>
            {l.label}
          </a>
        ))}
      </div>
    </section>
  );
}

export function Landing() {
  const graph: Graph = JSON.parse(readFileSync(join(process.cwd(), "public/graph.json"), "utf8"));

  return (
    <>
      <div className="topbar-sticky">
        <span style={{ color: "var(--ink)" }}>{config.brand.name}</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-2)" }}>
          <i className="dot" />
          this page is a Triplane instance
        </span>
      </div>

      <div className="doc" style={{ maxWidth: 860 }}>
        <p className="tag" style={{ display: "inline-block", marginBottom: 14 }}>Publishing engine for the agentic web</p>
        <h1 style={{ fontSize: 44, marginBottom: 14 }}>
          Write the definition once.<br />Humans, agents and the ecosystem all get it.
        </h1>
        <p className="lead" style={{ maxWidth: "58ch" }}>
          Your definitions already exist — in a wiki nobody trusts, a dbt description, someone&apos;s head.
          Triplane compiles one governed markdown bundle into a website people read, a tool contract
          agents drive in the page, and discovery endpoints the wider ecosystem can find. One source.
          One approval path. Three planes that cannot drift, because they are the same build.
        </p>

        <div style={{ border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", margin: "28px 0 8px" }}>
          <GraphView height={300} />
        </div>
        <p style={{ fontSize: 12, color: "var(--hint)", margin: "0 0 32px" }}>
          {graph.nodes.length} concepts · {graph.edges.length} relationships · bundle{" "}
          <code style={{ fontSize: ".95em" }}>{graph.bundleHash}</code> — the same graph behind every
          claim below.
        </p>

        <Plane n="01" title="A website people read" who="Plane 1 · humans"
          links={[{ label: "Browse the concepts", href: "/concepts" }]}>
          Every concept is one markdown file with frontmatter: owner, steward, review date,
          classification. The page shows lineage, schema and what references it — so a reader can
          see not just the definition but who stands behind it and when it was last checked.
        </Plane>

        <Plane n="02" title="Tools an agent drives in the page" who="Plane 2 · in-page agents"
          links={[{ label: "Ask the agent →", href: "/concepts" }]}>
          The same bundle registers a tool contract on the page through WebMCP. The assistant on the
          right answers only from published concepts and cites the id behind every claim; ask it
          something and watch it light the path it took through the graph. Page-scoped tools appear
          and disappear with the page you are on.
        </Plane>

        <Plane n="03" title="Endpoints the ecosystem can find" who="Plane 3 · external agents"
          links={[
            { label: "ai-catalog.json", href: "/.well-known/ai-catalog.json" },
            { label: "llms.txt", href: "/llms.txt" },
            { label: "Raw OKF bundle", href: "/api/bundle" }
          ]}>
          A publisher-hosted catalog describes what this site knows and how to reach it, backed by an
          MCP server carrying the read tools. An agent that has never seen this site can discover it,
          verify the publisher, connect and answer — citing the same concept ids the in-page agent
          cites. Write and page-scoped tools are deliberately absent out here.
        </Plane>

        <Plane n="04" title="Approval is the deploy" who="the governance gate"
          links={[{ label: "Open the review queue", href: "/govern" }]}>
          Agents can draft; only a person can publish. Every write becomes a proposal, a human
          approves it, and the build reruns — moving the website, the tools and the catalog together.
          Authors never touch git. Git sees everything.
        </Plane>

        <Plane n="05" title="Any bundle, same engine" who="white-label"
          links={[{ label: "Try your own bundle", href: "/sandbox" }]}>
          Nothing in the engine knows what your concepts are about — a test in CI fails the build if
          bundle vocabulary leaks into it. Swap the bundle, rebrand, redeploy: analytics definitions,
          financial controls, care pathways. Drop your own markdown into the sandbox and watch the
          same compiler build the same three planes from it.
        </Plane>

        <p style={{ borderTop: "1px solid var(--line)", paddingTop: 20, marginTop: 24, color: "var(--ink-2)" }}>
          One commit. Three planes. Authors never see git; git sees everything.
        </p>
      </div>
    </>
  );
}
