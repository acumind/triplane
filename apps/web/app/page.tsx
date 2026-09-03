import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import type { Graph } from "@triplane/engine";
import { GraphView } from "../components/GraphView";
import { humanizeType } from "../lib/display";

export const dynamic = "force-dynamic";

export default function Home() {
  const graph: Graph = JSON.parse(readFileSync(join(process.cwd(), "public/graph.json"), "utf8"));
  const byType = new Map<string, typeof graph.nodes>();
  for (const n of [...graph.nodes].sort((a, b) => a.title.localeCompare(b.title))) {
    byType.set(n.type, [...(byType.get(n.type) ?? []), n]);
  }
  const groups = [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const domain = graph.nodes.find((n) => n.type === "domain");

  return (
    <>
      <div className="topbar-sticky">
        <span style={{ color: "var(--ink)" }}>{domain?.title ?? "Concept index"}</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-2)" }}>
          <i className="dot" />
          {graph.nodes.length} published · bundle {graph.bundleHash}
        </span>
      </div>

      <div className="doc">
        <h1>Concept index</h1>
        <p className="lead">
          Every concept is one governed markdown file. The same definitions drive this page, the in-page
          agent, and the discovery endpoints.
        </p>
        <div style={{ border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", margin: "0 0 32px" }}>
          <GraphView height={300} />
        </div>

        {groups.map(([type, ns]) => (
          <section key={type}>
            <h2>{humanizeType(type)}</h2>
            {ns.map((n) => (
              <div className="rowlist" key={n.id}>
                {/* The type is already the section heading; repeating it per row is noise. */}
                <Link href={`/c/${n.id}`} style={{ textDecoration: "none" }}>{n.title}</Link>
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
