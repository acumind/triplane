"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Graph, UIBridge } from "@triplane/engine";
import { loadGraph } from "./WebMCPProvider";
import { bus, emitHighlight } from "../lib/bus";
import { Menu } from "./Menu";
import { addFlag, deleteThread, saveThread, threads as savedThreads, type SavedThread } from "../lib/prefs";
import { copyText } from "../lib/clipboard";
import { sampleQuestion } from "../lib/page";
import { useReviewerMode } from "../lib/reviewer";
import { usePermissions } from "../lib/permissions";
import { isRestricted } from "../lib/concept";
import { conceptIdFromPath } from "../lib/page";
import { toolsForPage, runTool, type Msg } from "./agent-loop";
import { Icon, type IconName } from "./Icon";

/**
 * The Ask panel. The agent loop underneath is unchanged — browser-driven, model call
 * proxied through /api/agent, tools executed in the page — this is its presentation.
 *
 * The design's citation model matches what the agent already emits: it is instructed to
 * cite concept ids in [brackets], which render here as superscripts that link to the
 * concept, and a "Not covered:" line becomes the coverage-gap callout.
 */

interface TraceStep { name: string; input: unknown }
type Entry =
  | { kind: "user"; text: string }
  | { kind: "tool"; text: string }
  | { kind: "error"; text: string; retry: string }
  | { kind: "answer"; text: string; concepts: string[]; trace: TraceStep[] };

/** The thread as markdown, for Copy and Share thread. */
function transcript(log: Entry[]): string {
  return log
    .filter((e) => e.kind !== "tool")
    .map((e) => (e.kind === "user" ? `**Q:** ${e.text}` : e.text))
    .join("\n\n");
}

/**
 * `[concept-id]` becomes a linked superscript citation, and the model's inline markdown
 * is rendered rather than printed — an answer showing literal `**bold**` reads as a bug.
 * Deliberately just bold and code: this is a chat bubble, not a document.
 */
function inline(text: string, key: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <b key={`${key}-${i}`}>{part.slice(2, -2)}</b>;
    if (/^`[^`]+`$/.test(part)) return <code key={`${key}-${i}`}>{part.slice(1, -1)}</code>;
    return <span key={`${key}-${i}`}>{part}</span>;
  });
}

function withCitations(text: string, ids: Set<string>) {
  return text.split(/(\[[a-z0-9-]+\])/g).map((part, i) => {
    const m = part.match(/^\[([a-z0-9-]+)\]$/);
    if (!m || !ids.has(m[1])) return <span key={i}>{inline(part, String(i))}</span>;
    return (
      <Link key={i} href={`/c/${m[1]}`} className="cite" title={`Cited concept: ${m[1]}`}>
        {m[1]}
      </Link>
    );
  });
}

export function AskPanel() {
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState("");
  const [log, setLog] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const [graphIds, setGraphIds] = useState<Set<string>>(new Set());
  const [traceOpen, setTraceOpen] = useState<number | null>(null);
  const [flagging, setFlagging] = useState<number | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [toast, setToast] = useState("");
  const [threadList, setThreadList] = useState<SavedThread[]>([]);
  const [threadId, setThreadId] = useState(() => `t-${Date.now().toString(36)}`);
  const [info, setInfo] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const reviewer = useReviewerMode();
  const { canViewPII } = usePermissions();
  const [restricted, setRestricted] = useState(false);

  const ui = useMemo<UIBridge>(
    () => ({ openConcept: (id) => router.push(`/c/${id}`), highlightSubgraph: emitHighlight }),
    [router]
  );

  // Whether the concept in view is one whose contents are withheld from this reader.
  useEffect(() => {
    const id = conceptIdFromPath(pathname);
    if (!id) return setRestricted(false);
    loadGraph().then((g: Graph) => {
      const fm = g.nodes.find((n) => n.id === id)?.frontmatter as any;
      setRestricted(isRestricted(Array.isArray(fm?.classifications) ? fm.classifications.map(String) : []));
    });
  }, [pathname]);

  useEffect(() => {
    loadGraph().then((g: Graph) => {
      setHint(sampleQuestion(g));
      setGraphIds(new Set(g.nodes.map((n) => n.id)));
      setSnapshot(
        new Date(g.builtAt).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      );
    });
  }, []);

  useEffect(() => {
    document.body.dataset.ask = open ? "open" : "closed";
  }, [open]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [log, busy]);

  useEffect(() => setThreadList(savedThreads()), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  // Other parts of the shell (New concept, Propose change, Report an issue) seed the
  // composer rather than opening a separate editor.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const { text, send } = (e as CustomEvent<{ text: string; send: boolean }>).detail;
      setOpen(true);
      setQ(text);
      requestAnimationFrame(() => {
        box.current?.focus();
        box.current?.setSelectionRange(text.length, text.length);
      });
      if (send) ask(text);
    };
    bus?.addEventListener("ask", onAsk);
    return () => bus?.removeEventListener("ask", onAsk);
  }, []);

  // A thread is worth keeping once it has an answer in it.
  useEffect(() => {
    const first = log.find((e) => e.kind === "user");
    if (!first || !log.some((e) => e.kind === "answer")) return;
    saveThread({ id: threadId, title: (first as any).text.slice(0, 80), at: new Date().toISOString(), entries: log });
    setThreadList(savedThreads());
  }, [log, threadId]);

  function newThread() {
    setLog([]);
    setThreadId(`t-${Date.now().toString(36)}`);
    setTraceOpen(null);
    setFlagging(null);
  }

  async function ask(question = q.trim()) {
    if (!question || busy) return;
    setQ("");
    setLog((l) => [...l, { kind: "user", text: question }]);
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    const used = new Set<string>();
    const trace: TraceStep[] = [];
    try {
      const graph = await loadGraph();
      const tools = await toolsForPage(graph, pathname, reviewer);
      const messages: Msg[] = [{ role: "user", content: question }];

      for (let turn = 0; turn < 8; turn++) {
        const raw = await fetch("/api/agent", {
          method: "POST",
          signal: ac.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages, tools })
        });
        // A crashed route answers in HTML; don't let that surface as a JSON parse error.
        const res = await raw.json().catch(() => ({ error: `Server returned ${raw.status} ${raw.statusText}` }));
        if (res.error) throw new Error(typeof res.error === "string" ? res.error : res.error.message ?? JSON.stringify(res.error));

        const uses = (res.content ?? []).filter((c: any) => c.type === "tool_use");
        const texts = (res.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text);
        if (!uses.length) {
          const text = texts.join("\n");
          for (const m of text.matchAll(/\[([a-z0-9-]+)\]/g)) if (graphIds.has(m[1])) used.add(m[1]);
          setLog((l) => [...l, { kind: "answer", text, concepts: [...used], trace: [...trace] }]);
          break;
        }
        messages.push({ role: "assistant", content: res.content });
        const results = [];
        for (const u of uses) {
          // Every concept the agent actually opened counts toward coverage.
          for (const val of Object.values(u.input ?? {}).flat()) {
            if (typeof val === "string" && graphIds.has(val)) used.add(val);
          }
          trace.push({ name: u.name, input: u.input });
          setLog((l) => [...l, { kind: "tool", text: `${u.name} ${JSON.stringify(u.input)}` }]);
          const out = await runTool(u.name, u.input, graph, ui, reviewer, ac.signal);
          results.push({ type: "tool_result", tool_use_id: u.id, content: out });
        }
        messages.push({ role: "user", content: results });
      }
    } catch (e: any) {
      // A cancelled question is not a failure; a failed one keeps the text so it can be retried.
      const stopped = e?.name === "AbortError";
      setLog((l): Entry[] =>
        stopped
          ? [...l, { kind: "tool", text: "stopped." }]
          : [...l, { kind: "error", text: e?.message ?? String(e), retry: question }]
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  if (!open) {
    return (
      <button
        className="btn-secondary"
        style={{ position: "fixed", right: 20, bottom: 20, zIndex: 30 }}
        onClick={() => setOpen(true)}
      >
        Ask
      </button>
    );
  }

  return (
    <aside className="col-ask">
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 52, padding: "0 18px", flex: "none" }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Ask</span>
        {snapshot && <span style={{ fontSize: 11, color: "var(--hint)" }}>snapshot {snapshot}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 2, alignItems: "center" }}>
          <Menu
            label="Threads"
            tip="Threads"
            width={260}
            items={[
              { label: "New thread", onSelect: newThread, note: log.length ? undefined : "current" },
              ...threadList.map((t) => ({
                label: t.title,
                note: new Date(t.at).toLocaleDateString(),
                onSelect: () => {
                  setThreadId(t.id);
                  setLog(t.entries as Entry[]);
                }
              })),
              ...(threadList.length
                ? [{ label: "Clear saved threads", onSelect: () => { threadList.forEach((t) => deleteThread(t.id)); setThreadList([]); } }]
                : [{ label: "No saved threads yet", disabled: true }])
            ]}
          >
            <Icon name="threads" />
          </Menu>
          <div style={{ position: "relative", display: "inline-flex" }}>
            <button
              className="icon-btn" style={{ width: 28, height: 28 }}
              data-tip={info ? undefined : "How answers work"} aria-label="How answers work" aria-expanded={info}
              onClick={() => setInfo((v) => !v)}
            >
              <Icon name="info" />
            </button>
            {info && (
              <div className="popover" onMouseLeave={() => setInfo(false)}>
                <b style={{ color: "var(--ink)" }}>How answers work</b>
                <p style={{ margin: "6px 0 0" }}>
                  Every answer is built only from published concepts in this bundle, using the same tool
                  contract agents get. Superscripts are the concept ids that were actually retrieved —
                  click one to read the source. “Show trace” lists the calls behind an answer.
                </p>
                <p style={{ margin: "8px 0 0" }}>
                  Snapshot {snapshot || "—"}. Nothing here can publish: writes only ever create a
                  proposal for a person to approve.
                </p>
              </div>
            )}
          </div>
          <button className="icon-btn" style={{ width: 28, height: 28 }} data-tip="Close" aria-label="Close" onClick={() => setOpen(false)}><Icon name="close" /></button>
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 18, fontSize: 13.5 }}>
        {log.length === 0 && (
          <div style={{ color: "var(--ink-2)" }}>
            <p style={{ margin: "0 0 12px" }}>
              Answers are drawn only from published concepts, and every claim carries the concept id it came from.
            </p>
            {hint && (
              <button
                onClick={() => ask(hint)}
                style={{
                  display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                  border: "1px solid var(--line-control)", borderRadius: 6, background: "var(--ground)",
                  padding: "8px 12px", fontSize: 13.5, color: "var(--ink)"
                }}
              >
                {hint}
              </button>
            )}
          </div>
        )}

        {log.map((e, i) =>
          e.kind === "user" ? (
            <div key={i} className="msg-user">{e.text}</div>
          ) : e.kind === "error" ? (
            // An error is not a tool line: name what failed and offer the question back.
            <div
              key={i}
              style={{ borderLeft: "2px solid var(--rule)", padding: "4px 12px", fontSize: 12.5, color: "var(--ink-2)" }}
            >
              <div style={{ marginBottom: 8 }}>That question did not complete: {e.text}</div>
              <button className="btn-secondary" onClick={() => ask(e.retry)} disabled={busy}>
                Try again
              </button>
            </div>
          ) : e.kind === "tool" ? (
            // Tool arguments are unbounded strings; without this they run past the panel.
            <div
              key={i}
              style={{
                fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--hint)",
                margin: "-10px 0", overflowWrap: "anywhere", lineHeight: 1.5
              }}
            >
              {e.text}
            </div>
          ) : (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: "var(--hint)" }}>
                <i className="dot" />
                {e.concepts.length} published concept{e.concepts.length === 1 ? "" : "s"} ·{" "}
                {e.concepts.length >= 3 ? "high" : e.concepts.length ? "partial" : "no"} coverage
              </div>
              {e.text
                .split("\n")
                .filter((line) => !/^\s*Not covered:/i.test(line))
                .map((line, j) =>
                  line.trim() ? (
                    <p key={j} style={{ margin: 0, lineHeight: 1.65, color: "var(--ink)" }}>
                      {withCitations(line, graphIds)}
                    </p>
                  ) : null
                )}
              {/* The model is asked to end with "Not covered: …" when the bundle has a
                  gap; that line becomes the callout rather than sitting in the prose. */}
              {e.text.split("\n").filter((l) => /^\s*Not covered:/i.test(l)).map((l, j) => (
                <div key={j} style={{ borderLeft: "2px solid var(--rule)", padding: "4px 12px", fontSize: 12.5, color: "var(--ink-2)" }}>
                  {l.trim()} <Link href="/govern">Ask the owner</Link>
                </div>
              ))}
              <div style={{ display: "flex", gap: 2, marginLeft: -6, alignItems: "center" }}>
                <button
                  className="icon-btn" style={{ width: 28, height: 28, color: "var(--ink-3)" }}
                  data-tip="Copy" aria-label="Copy answer"
                  onClick={async () => setToast((await copyText(e.text)) ? "Answer copied" : "Copy blocked by the browser")}
                >
                  <Icon name="copy" />
                </button>
                <button
                  className="icon-btn" style={{ width: 28, height: 28, color: "var(--ink-3)" }}
                  data-tip="Share thread" aria-label="Copy the whole thread"
                  onClick={async () => setToast((await copyText(transcript(log))) ? "Thread copied" : "Copy blocked by the browser")}
                >
                  <Icon name="share" />
                </button>
                <button
                  className="icon-btn" style={{ width: 28, height: 28, color: flagging === i ? "var(--ink)" : "var(--ink-3)" }}
                  data-tip="Flag as incorrect" aria-label="Flag as incorrect" aria-expanded={flagging === i}
                  onClick={() => { setFlagging(flagging === i ? null : i); setFlagNote(""); }}
                >
                  <Icon name="flag" />
                </button>
                <button
                  className="icon-btn" style={{ width: 28, height: 28, color: traceOpen === i ? "var(--ink)" : "var(--ink-3)" }}
                  data-tip={traceOpen === i ? "Hide trace" : "Show trace"} aria-label="Show trace" aria-expanded={traceOpen === i}
                  onClick={() => setTraceOpen(traceOpen === i ? null : i)}
                >
                  <Icon name="trace" />
                </button>
                {toast && <span style={{ fontSize: 11, color: "var(--hint)", marginLeft: 4 }}>{toast}</span>}
              </div>

              {/* The trace is not reconstructed — these are the calls this answer made. */}
              {traceOpen === i && (
                <div style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", fontSize: 11.5, fontFamily: "var(--mono)", color: "var(--ink-2)" }}>
                  {e.trace.length === 0 && <div style={{ color: "var(--hint)" }}>Answered without retrieving anything.</div>}
                  {e.trace.map((t, j) => (
                    <div key={j} style={{ padding: "2px 0", overflowWrap: "anywhere" }}>
                      {t.name} {JSON.stringify(t.input)}
                    </div>
                  ))}
                </div>
              )}

              {flagging === i && (
                <div style={{ border: "1px solid var(--line-control)", borderRadius: 6, padding: 10 }}>
                  <label style={{ fontSize: 11.5, color: "var(--hint)", display: "block", marginBottom: 6 }}>
                    What is wrong? Goes to the concept owner.
                  </label>
                  <textarea
                    value={flagNote}
                    onChange={(ev) => setFlagNote(ev.target.value)}
                    rows={3}
                    style={{ width: "100%", font: "inherit", fontSize: 13, border: "1px solid var(--line-control)", borderRadius: 6, padding: 8, resize: "vertical", color: "var(--ink)" }}
                  />
                  <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                    <button
                      className="btn-secondary"
                      disabled={!flagNote.trim()}
                      onClick={() => {
                        const concept = e.concepts[0] ?? "";
                        addFlag({ at: new Date().toISOString(), concept, note: flagNote.trim(), answer: e.text });
                        copyText(
                          `Reported issue\nConcept: ${concept || "(none cited)"}\nNote: ${flagNote.trim()}\n\nAnswer:\n${e.text}`
                        ).then((ok) => setToast(ok ? "Report saved and copied" : "Report saved locally"));
                        setFlagging(null);
                      }}
                    >
                      Send report
                    </button>
                    <button className="btn-secondary" onClick={() => setFlagging(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {busy && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: "var(--hint)" }}>
            <i className="dot-draft" />
            Searching published concepts…
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div style={{ padding: "12px 18px 14px", flex: "none" }}>
        {restricted && !canViewPII && (
          <div
            style={{
              display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8,
              fontSize: 11.5, color: "var(--ink-2)", borderLeft: "2px solid var(--rule)", padding: "2px 10px"
            }}
          >
            <span style={{ color: "var(--hint)", marginTop: 1 }}><Icon name="lock" size={12} /></span>
            <span>This concept is restricted — its contents are withheld from the page above.</span>
          </div>
        )}
        <div className="composer">
          <textarea
            ref={box}
            rows={1}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // Enter submits; Shift+Enter is a newline.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            placeholder="Ask anything…"
          />
          <button
            className="send"
            onClick={() => (busy ? abortRef.current?.abort() : ask())}
            disabled={!busy && !q.trim()}
            aria-label={busy ? "Stop" : "Send"}
            data-tip={busy ? "Stop" : "Send"}
          >
            {busy ? <Icon name="close" size={13} /> : <Icon name="send" size={14} />}
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--hint)" }}>
          Cites published concepts only · Logged to audit
        </div>
      </div>
    </aside>
  );
}
