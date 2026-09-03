"use client";
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import type { Graph } from "@triplane/engine";
import { GraphView } from "../../components/GraphView";
import { Notice } from "../../components/Notice";
import { humanizeType } from "../../lib/display";

/**
 * Bring your own bundle.
 *
 * Drop markdown in and watch the same compiler the build uses turn it into a graph, a
 * tool contract and a discovery catalog. Nothing is written anywhere: this previews a
 * bundle, it does not deploy one — publishing still means a build, and changing a
 * published concept still means a proposal a person approves.
 */

interface Issue { level: "error" | "warn"; file: string; message: string }
interface Result {
  graph: Graph;
  issues: Issue[];
  tools: { name: string; kind: string; scope: unknown; description: string }[];
  catalog: unknown;
}

const SEED = `---
id: incident-severity
type: term
title: Incident severity (definition)
owner: Platform Reliability
---
How badly a service is degraded, on a scale everyone uses the same way.

Sev1 means customer-visible loss of a core flow. Sev2 is degraded but usable. Anything
that only a dashboard noticed is Sev3, and it links to [[oncall-rotation]].
`;

const SEED2 = `---
id: oncall-rotation
type: runbook
title: "Runbook: on-call rotation"
owner: Platform Reliability
---
Who is paged, in what order, and what they are expected to do first.

Severity is decided using [[incident-severity]], never negotiated during the incident.
`;

export default function Sandbox() {
  const [files, setFiles] = useState<{ path: string; content: string }[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drop = useRef<HTMLDivElement>(null);

  const compile = useCallback(async (next: { path: string; content: string }[]) => {
    setFiles(next);
    setError("");
    setResult(null);
    if (!next.length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files: next })
      });
      const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
      if (data.error) throw new Error(data.error);
      setResult(data as Result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    const picked = [...list].filter((f) => f.name.endsWith(".md"));
    if (!picked.length) return setError("Those files are not markdown. A bundle is .md files.");
    compile(await Promise.all(picked.map(async (f) => ({ path: f.name, content: await f.text() }))));
  }

  const errors = result?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = result?.issues.filter((i) => i.level === "warn") ?? [];
  const byType = new Map<string, string[]>();
  for (const n of result?.graph.nodes ?? []) byType.set(n.type, [...(byType.get(n.type) ?? []), n.title]);

  return (
    <>
      <div className="topbar-sticky">
        {/* Not the brand: this page is client-only, and a client bundle cannot read the
            deployment's brand out of config — it would say "Triplane" on every tenant. */}
        <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>Home</Link>
        <span>/</span>
        <span style={{ color: "var(--ink)" }}>sandbox</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--hint)" }}>
          nothing here is saved or published
        </span>
      </div>

      <div className="doc">
        <h1>Try your own bundle</h1>
        <p className="lead">
          Drop in markdown with YAML frontmatter and the same compiler the build uses will turn it
          into a graph, a tool contract and a discovery catalog. This previews a bundle — it does not
          deploy one.
        </p>

        <div
          ref={drop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}
          style={{
            border: `1px ${dragging ? "solid" : "dashed"} ${dragging ? "var(--ink)" : "var(--rule-dash)"}`,
            borderRadius: 6, padding: "28px 20px", textAlign: "center", marginBottom: 12,
            background: dragging ? "var(--hover)" : "transparent"
          }}
        >
          <p style={{ margin: "0 0 12px", color: "var(--ink-2)", fontSize: 13 }}>
            Drop <code>.md</code> files here — up to 50 files, 512 KB.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <label className="btn-secondary" style={{ cursor: "pointer" }}>
              Choose files
              <input type="file" accept=".md" multiple hidden onChange={(e) => onFiles(e.target.files)} />
            </label>
            <button
              className="btn-secondary"
              onClick={() => compile([{ path: "incident-severity.md", content: SEED }, { path: "oncall-rotation.md", content: SEED2 }])}
            >
              Use an example
            </button>
            {files.length > 0 && (
              <button className="btn-secondary" onClick={() => compile([])}>Clear</button>
            )}
          </div>
        </div>

        {busy && <Notice>Compiling…</Notice>}
        {error && <Notice inset>{error}</Notice>}

        {result && (
          <>
            <h2>Lint</h2>
            {errors.length === 0 && warnings.length === 0 && (
              <Notice inset>Clean. This bundle would build.</Notice>
            )}
            {errors.length > 0 && (
              <Notice inset>
                <b>{errors.length} error{errors.length === 1 ? "" : "s"} — the build would fail.</b>
                <span style={{ display: "block", marginTop: 6, fontFamily: "var(--mono)", fontSize: 11.5 }}>
                  {errors.map((i, k) => <span key={k} style={{ display: "block" }}>{i.file}: {i.message}</span>)}
                </span>
              </Notice>
            )}
            {warnings.length > 0 && (
              <p style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--hint)" }}>
                {warnings.map((i, k) => <span key={k} style={{ display: "block" }}>warn · {i.file}: {i.message}</span>)}
              </p>
            )}

            <h2>Plane 1 — what people would read</h2>
            <p style={{ fontSize: 12, color: "var(--hint)", margin: "0 0 12px" }}>
              {result.graph.nodes.length} concepts · {result.graph.edges.length} relationships · bundle{" "}
              <code style={{ fontSize: ".95em" }}>{result.graph.bundleHash}</code>
            </p>
            {result.graph.nodes.length > 0 && (
              <div style={{ border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
                <GraphView height={260} graph={result.graph} />
              </div>
            )}
            {[...byType.entries()].sort().map(([type, titles]) => (
              <div className="rowlist" key={type}>
                <span className="rel">{humanizeType(type)}</span>
                <span>{titles.join(", ")}</span>
              </div>
            ))}

            <h2>Plane 2 — the tools agents would drive</h2>
            {result.tools.map((t) => (
              <div className="rowlist" key={t.name}>
                <span className="rel">{t.kind}</span>
                <span>
                  <code>{t.name}</code>{" "}
                  <span style={{ color: "var(--hint)" }}>
                    {t.scope === "global" ? "everywhere" : `only on ${(t.scope as any).pageType} pages`}
                  </span>
                </span>
              </div>
            ))}

            <h2>Plane 3 — what the ecosystem would discover</h2>
            <pre className="machine">{JSON.stringify(result.catalog, null, 2)}</pre>
            <Notice>
              Write and page-scoped tools are deliberately absent from that catalog — they never
              leave the browser.
            </Notice>
          </>
        )}
      </div>
    </>
  );
}
