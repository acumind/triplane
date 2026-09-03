"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { renderConceptFile } from "../../lib/markdown";
import { useReviewerMode, setReviewerMode } from "../../lib/reviewer";
import { emitAsk } from "../../lib/bus";
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
/** Why the visitor is here: "New concept" and "Propose change" send a reader to this
 *  page rather than to an editor, because there is no editor. */
type Intent = { kind: "new" | "change"; subject?: string };

export default function Govern() {
  const reviewer = useReviewerMode();
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [backend, setBackend] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  // What the last approval actually did. Two different things wear the word "approve"
  // here: on the fs store it rebuilds and the site changes; on the GitHub store it merges
  // a PR and the site does not change until something rebuilds from that commit. Saying
  // nothing in the second case is how an approval reads as a publish that vanished.
  const [outcome, setOutcome] = useState<
    | { kind: "published"; hash: string; concepts: number }
    | { kind: "merged"; id: string; base: string; hash: string }
    | null
  >(null);
  // Read off location for the same reason reviewer mode is: useSearchParams would put a
  // Suspense boundary on the route for a value only the client ever has.
  const [intent, setIntent] = useState<Intent | null>(null);
  const seeded = useRef(false);

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

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const kind = q.get("intent");
    if (kind === "new" || kind === "change") setIntent({ kind, subject: q.get("for") ?? undefined });
  }, []);

  // In reviewer mode the intent is answered rather than explained: open the composer on
  // the draft the visitor came here to write, once.
  useEffect(() => {
    if (!reviewer || !intent || seeded.current) return;
    seeded.current = true;
    emitAsk(intent.kind === "new" ? "Draft a concept for " : `Draft a change to ${intent.subject ?? ""} that `);
  }, [reviewer, intent]);

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
      if (action === "approve") {
        // Don't claim anything on the say-so of the route: read the artifact back. The
        // hash is the evidence either way — that it moved, or that it did not.
        const g = await fetch(`/graph.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
        setOutcome(
          data.rebuilt
            ? { kind: "published", hash: g.bundleHash, concepts: g.nodes.length }
            : { kind: "merged", id, base: data.base || "main", hash: g.bundleHash }
        );
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
              <button className="btn-secondary" onClick={() => setReviewerMode(true)}>
                {intent ? "Turn on reviewer mode and draft" : "Turn on reviewer mode"}
              </button>
            }
          >
            {intent ? (
              <>
                <b style={{ fontWeight: 500, color: "var(--ink)" }}>
                  Nothing is filled in here — {intent.kind === "new" ? "a concept" : "a change"} starts as a draft the
                  agent writes.
                </b>{" "}
                You describe it in the Ask panel on the right, the agent writes the file, and it arrives in this queue
                for your approval. Reviewer mode is what turns that drafting tool on.
              </>
            ) : (
              <>Reviewer mode is off, so the write tool and the Propose affordance are hidden.</>
            )}
          </Notice>
        )}

        {reviewer && intent && (
          <Notice inset>
            The Ask panel on the right is open with a draft request
            {intent.subject ? (
              <>
                {" "}
                for <code>{intent.subject}</code>
              </>
            ) : null}
            . Finish the sentence and send it — the agent&rsquo;s draft lands here for you to approve.
          </Notice>
        )}

        {error && <Notice inset action={<button className="btn-secondary" onClick={load}>Retry</button>}>{error}</Notice>}

        {outcome?.kind === "published" && (
          <Notice inset>
            <i className="dot" style={{ display: "inline-block", marginRight: 8 }} />
            Published. Bundle <code>{outcome.hash}</code>, {outcome.concepts} concepts — live on all three planes.
          </Notice>
        )}

        {outcome?.kind === "merged" && (
          <Notice inset>
            <i className="dot-draft" style={{ display: "inline-block", marginRight: 8 }} />
            <span>
              Approved — proposal <code>{outcome.id}</code> is merged into <code>{outcome.base}</code>.{" "}
              <b style={{ fontWeight: 500, color: "var(--ink)" }}>Nothing here has changed yet.</b> This site still
              serves bundle <code>{outcome.hash}</code>; all three planes move when the deployment rebuilds from that
              commit. If it does not rebuild itself, the concept is in the repo and not on the site.
            </span>
          </Notice>
        )}

        {proposals === null && !error && <Notice>Reading the queue…</Notice>}
        {proposals?.length === 0 &&
          !(reviewer && intent) &&
          (reviewer ? (
            <Notice
              action={
                <button className="btn-secondary" onClick={() => emitAsk("Draft a concept for ")}>
                  Draft a concept
                </button>
              }
            >
              Nothing awaiting review. A draft starts in the Ask panel and lands here.
            </Notice>
          ) : (
            <p style={{ color: "var(--ink-2)" }}>
              Nothing awaiting review. A concept reaches this queue as an agent&rsquo;s draft, and leaves it when a
              person approves.
            </p>
          ))}

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
