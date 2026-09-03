"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { renderConceptFile } from "../../lib/markdown";
import { useReviewerMode } from "../../lib/reviewer";
import { Notice } from "../../components/Notice";
import { Icon } from "../../components/Icon";

/**
 * The governance console — the write plane's only door.
 *
 * An agent can draft a concept; it cannot publish one. Everything it drafts waits here
 * until a human clicks Approve, and that click is what reruns the build and moves all
 * three planes at once. Approval is the deploy.
 *
 * Design follows the quiet handoff like every other route: a sticky bar, the document
 * column, hairlines. Green marks status — here, that a proposal is awaiting review.
 */

type FileDiff = { path: string; proposed: string; current: string | null };
type Proposal = { id: string; message?: string; createdAt?: string; diffUrl: string; files: FileDiff[] };

export default function Govern() {
  const reviewer = useReviewerMode();
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [backend, setBackend] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [published, setPublished] = useState<{ id: string; hash: string; concepts: number } | null>(null);

  const load = useCallback(async () => {
    setError("");
    const res = await fetch("/api/govern", { cache: "no-store" });
    const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
    if (data.error) return setError(data.error);
    setProposals(data.proposals);
    setBackend(data.backend);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/govern", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id })
      });
      const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
      if (data.error) throw new Error(data.error);
      if (action === "approve" && data.rebuilt) {
        // Don't claim "published" on the say-so of the route: read the artifact back.
        const g = await fetch(`/graph.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
        setPublished({ id, hash: g.bundleHash, concepts: g.nodes.length });
      }
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="topbar-sticky">
        <span>Review</span>
        <span>/</span>
        <span style={{ color: "var(--ink)" }}>queue</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-2)", fontSize: 12 }}>
          <i className={proposals?.length ? "dot" : "dot-draft"} />
          {proposals === null ? "loading" : `${proposals.length} awaiting review`}
          {backend && <> · store {backend}</>}
        </span>
        <button
          className="icon-btn"
          style={{ width: 30, height: 30, marginLeft: 4 }}
          data-tip="Refresh"
          aria-label="Refresh the queue"
          onClick={load}
        >
          <Icon name="history" />
        </button>
      </div>

      <div className="doc">
        <h1>Governance</h1>
        <p className="lead">
          An agent can draft a concept. Only a person here can publish one — approval is the deploy.
        </p>

        {!reviewer && (
          <Notice
            inset
            action={
              <Link href="/govern?reviewer=1" className="btn-secondary" style={{ textDecoration: "none" }}>
                Turn on reviewer mode
              </Link>
            }
          >
            Reviewer mode is off, so the write tool and the Propose affordance are hidden.
          </Notice>
        )}

        {error && <Notice inset action={<button className="btn-secondary" onClick={load}>Retry</button>}>{error}</Notice>}

        {published && (
          <Notice inset>
            <i className="dot" style={{ display: "inline-block", marginRight: 8 }} />
            Published. Bundle <code>{published.hash}</code>, {published.concepts} concepts — live on all three planes.
          </Notice>
        )}

        {proposals === null && !error && <Notice>Reading the queue…</Notice>}
        {proposals?.length === 0 && (
          <p style={{ color: "var(--ink-2)" }}>
            Nothing awaiting review. Ask the sidebar agent to draft a concept in reviewer mode and it will appear here.
          </p>
        )}

      {proposals?.map((p) => (
        <article key={p.id} style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="dot" title="awaiting review" />
            <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-.015em", margin: 0 }}>{p.message ?? p.id}</h2>
          </div>
          <p style={{ color: "var(--hint)", fontSize: 12, margin: "4px 0 18px" }}>
            <span style={{ fontFamily: "var(--mono)" }}>{p.id}</span>
            {p.createdAt && <> · {new Date(p.createdAt).toLocaleString()}</>}
          </p>

          {p.files.map((f) => (
            <section key={f.path} style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 12, margin: "0 0 8px", color: "var(--ink-2)" }}>
                <code>{f.path}</code>{" "}
                <span style={{ color: "var(--hint)" }}>
                  {f.current === null ? "new concept" : "replaces the published version"}
                </span>
              </p>
              <div style={f.current === null ? single : side}>
                {f.current !== null && (
                  <div style={pane}>
                    <p style={paneLabel}>current</p>
                    <article dangerouslySetInnerHTML={{ __html: renderConceptFile(f.current) }} />
                  </div>
                )}
                <div style={pane}>
                  <p style={paneLabel}>proposed</p>
                  <article dangerouslySetInnerHTML={{ __html: renderConceptFile(f.proposed) }} />
                </div>
              </div>
            </section>
          ))}

          <div style={{ display: "flex", gap: ".5rem" }}>
            <button className="ui" style={primary} disabled={!!busy} onClick={() => act(p.id, "approve")}>
              {busy === p.id ? "Publishing…" : "Approve & publish"}
            </button>
            <button className="ui" style={secondary} disabled={!!busy} onClick={() => act(p.id, "reject")}>
              Reject
            </button>
          </div>
        </article>
      ))}
      </div>
    </>
  );
}

const card: React.CSSProperties = { borderTop: "1px solid var(--line)", padding: "24px 0" };
const side: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 };
const single: React.CSSProperties = { display: "block" };
const pane: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 6, padding: "12px 14px", minWidth: 0 };
const paneLabel: React.CSSProperties = { fontSize: 11, color: "var(--hint)", margin: "0 0 8px" };
const primary: React.CSSProperties = {
  background: "var(--ink)", color: "#fff", border: "1px solid var(--ink)",
  padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500
};
const secondary: React.CSSProperties = {
  background: "var(--ground)", color: "var(--ink)", border: "1px solid var(--line-control)",
  padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13
};
