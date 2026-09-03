"use client";
import { Icon } from "./Icon";
import { emitAsk } from "../lib/bus";

/**
 * The no-access state. The handoff is explicit that it shows a lock and "Request access"
 * rather than hiding the concept — a reader has to be able to see that something exists,
 * who owns it, and how to ask, or they cannot even find out what they are missing.
 */
export function NoAccess({
  what,
  conceptId,
  title,
  owner
}: {
  what: string;
  conceptId: string;
  title: string;
  owner?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--line-control)", borderRadius: 6, padding: "18px 20px",
        display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 16
      }}
    >
      <span style={{ color: "var(--ink-3)", marginTop: 2 }}><Icon name="lock" /></span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, marginBottom: 4 }}>{what} is restricted</div>
        <p style={{ margin: "0 0 12px", color: "var(--ink-2)", fontSize: 13 }}>
          This concept is classified confidential. You can see that it exists, who owns it and what
          it connects to{owner ? `, and ${owner} can grant access` : ""} — the contents need
          permission you do not currently hold.
        </p>
        <button
          className="btn-secondary"
          onClick={() => emitAsk(`Request access to ${title} (${conceptId}) because `)}
        >
          Request access
        </button>
      </div>
    </div>
  );
}
