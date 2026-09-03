import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Graph } from "@triplane/engine";
import { renderConcept, splitLead, renderLead } from "../../../lib/markdown";
import { humanizeType, pluralizeType } from "../../../lib/display";
import { conceptView, statusLine, isRestricted, type LineageNode } from "../../../lib/concept";
import { ConceptToolbar } from "../../../components/ConceptToolbar";
import { Gated } from "../../../components/Gated";
import { Notice } from "../../../components/Notice";

export const dynamic = "force-dynamic";

function LineageCard({ n }: { n: LineageNode }) {
  const body = (
    <>
      <div className="kicker">{n.kicker}</div>
      {n.label}
    </>
  );
  const cls = `node${n.policy ? " node-policy" : ""}`;
  return n.href ? <Link href={n.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export default async function Concept({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const graph: Graph = JSON.parse(readFileSync(join(process.cwd(), "public/graph.json"), "utf8"));
  const n = graph.nodes.find((x) => x.id === id);
  if (!n) notFound(); // 404, not a 200 that merely says "not found"

  const v = conceptView(graph, n);
  const { lead, rest } = splitLead(n.body);
  const html = renderConcept(rest);
  const domain = graph.nodes.find((x) => x.type === "domain")?.title ?? "";
  const restricted = isRestricted(v.tags);
  const lineageCaption = [
    `${v.upstream.length} upstream`,
    `${v.policies.length} policy`,
    `${v.downstream.length} downstream`
  ].join(" · ");

  return (
    <>
      <div className="topbar-sticky">
        {domain && <><span>{domain}</span><span>/</span></>}
        <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>{pluralizeType(n.type)}</Link>
        <span>/</span>
        <span style={{ color: "var(--ink)" }}>{n.id}</span>

        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-2)", fontSize: 12, marginRight: 8 }}>
          <i className={v.status.toLowerCase() === "published" ? "dot" : "dot-draft"} />
          {statusLine(v)}
        </span>
        <ConceptToolbar conceptId={n.id} title={n.title} path={n.path} owner={v.owner} restricted={restricted} />
      </div>

      <div className="doc">
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {v.tags.map((t) => <span key={t} className="tag">{t}</span>)}
        </div>
        <h1>{n.title}</h1>
        {lead && <p className="lead" dangerouslySetInnerHTML={{ __html: renderLead(lead) }} />}

        <div className="meta-strip">
          <div><div className="k">Owner</div>{v.owner ?? "—"}</div>
          <div><div className="k">Steward</div>{v.steward ?? "—"}</div>
          <div><div className="k">Next review</div>{v.nextReview ?? "—"}</div>
          <div>
            <div className="k">Concept ID</div>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{v.conceptId}</span>
          </div>
        </div>

        <h2>Lineage</h2>
        {v.upstream.length + v.policies.length + v.downstream.length === 0 ? (
          <Notice inset>
            Nothing links to or from this concept yet. Lineage is derived from the bundle&apos;s links,
            so it appears as soon as another concept references this one.
          </Notice>
        ) : (
          <>
            <div
              style={{
                display: "grid", gridTemplateColumns: "1fr 20px 1fr 20px 1fr",
                alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 12
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {v.upstream.map((u, i) => <LineageCard key={i} n={u} />)}
              </div>
              <div className="connector" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="node-current">
                  <div className="kicker">This {humanizeType(n.type).toLowerCase()}</div>
                  <b style={{ fontWeight: 600 }}>{n.id}</b>
                </div>
                {v.policies.map((p, i) => <LineageCard key={i} n={p} />)}
              </div>
              <div className="connector" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {v.downstream.map((d, i) => <LineageCard key={i} n={d} />)}
              </div>
            </div>
            <p style={{ margin: "0 0 36px", fontSize: 12, color: "var(--hint)" }}>
              {lineageCaption} · <Link href="/">Open full graph</Link>
            </p>
          </>
        )}

        {/* Only claim there is no schema when the body does not already render one: several
            concepts carry their columns as a markdown table rather than frontmatter. */}
        {n.type === "table" && v.columns.length === 0 && !html.includes("<table") && (
          <>
            <h2>Schema</h2>
            <Notice inset>
              No columns are recorded for this table. Add a <code>columns:</code> block to its
              frontmatter and they appear here, classification and all.
            </Notice>
          </>
        )}

        {(v.columns.length > 0 || html.trim()) && (
          <>
            {v.columns.length > 0 && <h2>Schema</h2>}
            {/* Schema and prose are both "contents"; withholding them separately would
                show the reader the same lock twice. Structure above stays visible. */}
            <Gated restricted={restricted} what="This concept" conceptId={n.id} title={n.title} owner={v.owner}>
              {v.columns.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Column</th><th style={{ paddingLeft: 8 }}>Type</th>
                      <th style={{ paddingLeft: 8 }}>Classification</th><th style={{ paddingLeft: 8 }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.columns.map((c) => (
                      <tr key={c.name}>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{c.name}</td>
                        <td style={{ color: "var(--ink-3)" }}>{c.type}</td>
                        <td>
                          {c.classification && (
                            <span className={c.classification.toLowerCase() === "pii" ? "pill-pii" : "pill-internal"}>
                              {c.classification}
                            </span>
                          )}
                        </td>
                        <td>{c.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {html.trim() && <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />}
            </Gated>
          </>
        )}

        <h2>Referenced by</h2>
        {v.references.length === 0 ? (
          <Notice inset>
            Nothing references this concept yet. That is worth knowing: an unreferenced concept is
            either new, or orphaned.
          </Notice>
        ) : (
          v.references.map((r, i) => (
            <div className="rowlist" key={i}>
              <span className="rel">{r.rel}</span>
              <Link href={`/c/${r.id}`} style={{ textDecoration: "none" }}>{r.label}</Link>
            </div>
          ))
        )}

        <h2>Machine view</h2>
        {/* Real endpoints, not illustrative ones: this is what an agent actually calls. */}
        <pre className="machine">
{`GET  /api/bundle?path=${n.path}
POST /api/mcp
src  ${n.path}`}
        </pre>
        <div style={{ display: "flex", gap: 6, fontSize: 12, color: "var(--ink-2)", alignItems: "center" }}>
          <a className="chip-outline" href="/graph.json" style={{ textDecoration: "none" }}>JSON</a>
          <a className="chip-outline" href={`/api/bundle?path=${encodeURIComponent(n.path)}`} style={{ textDecoration: "none" }}>Markdown</a>
          <a className="chip-outline" href="/.well-known/ai-catalog.json" style={{ textDecoration: "none" }}>Catalog</a>
          {v.usage && (
            <span style={{ marginLeft: "auto", color: "var(--hint)" }}>
              {v.usage.humanReads?.toLocaleString()} human reads · {v.usage.agentQueries?.toLocaleString()} agent queries
              {v.usage.window ? ` · ${v.usage.window}` : ""}
            </span>
          )}
        </div>

        <h2 id="recent-changes">Recent changes</h2>
        {v.changes.length > 0 ? (
          <>
            {v.changes.map((c) => (
              <div className="rowlist" key={c.version} style={{ border: 0 }}>
                <span className="rel">{c.version}</span>
                <span>
                  {c.summary}{" "}
                  <span style={{ color: "var(--hint)" }}>
                    {[c.author, c.at].filter(Boolean).join(" · ") && `· ${[c.author, c.at].filter(Boolean).join(" · ")}`}
                  </span>
                </span>
              </div>
            ))}
            <Link href="/govern" style={{ fontSize: 13, display: "inline-block", marginTop: 6 }}>
              View all versions
            </Link>
          </>
        ) : (
          <Notice inset>No version history recorded for this concept yet. Approved proposals appear here.</Notice>
        )}
      </div>
    </>
  );
}
