"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { DeploymentSwitcher } from "./DeploymentSwitcher";
import { humanizeType } from "../lib/display";
import { conceptIdFromPath } from "../lib/page";
import { emitAsk } from "../lib/bus";
import { useReviewerMode } from "../lib/reviewer";
import { usePermissions } from "../lib/permissions";
import { isRestricted } from "../lib/concept";

export interface TreeItem { id: string; title: string; status: string; classifications: string[] }

/**
 * The navigation sidebar. Grouped by concept type, because that is how the bundle is
 * organised and how a reader looks for something. The status dot is the only place a
 * chromatic colour appears in the whole interface.
 */
export function ConceptSidebar({
  brand,
  domain,
  peers,
  bundleHash,
  groups,
  error
}: {
  brand: string;
  domain: string;
  peers: { name: string; url: string }[];
  bundleHash: string;
  groups: [string, TreeItem[]][];
  /** Non-empty when the bundle could not be read; the tree cannot be shown at all. */
  error?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const reviewer = useReviewerMode();
  const { canViewPII } = usePermissions();
  const current = conceptIdFromPath(pathname);

  return (
    <aside className="col-side">
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 12px 8px" }}>
        <Link href="/" style={{ fontWeight: 600, fontSize: 13, padding: "0 4px", textDecoration: "none" }}>
          {brand}
        </Link>
        <button
          className="icon-btn"
          style={{ marginLeft: "auto", width: 28, height: 28 }}
          data-tip="Search ⌘K"
          aria-label="Search concepts"
          onClick={() => document.dispatchEvent(new CustomEvent("triplane:search"))}
        >
          <Icon name="search" />
        </button>
      </div>

      <div style={{ padding: "4px 12px 14px" }}>
        {/* A concept can only enter the bundle as a proposal, so "new" seeds the agent
            with a draft request in reviewer mode and otherwise explains the gate. */}
        <button
          className="row-btn"
          data-tip={reviewer ? "Draft a concept for review" : "Requires reviewer mode"}
          onClick={() => (reviewer ? emitAsk("Draft a concept for ") : router.push("/govern"))}
        >
          <span style={{ color: "var(--ink-3)", display: "grid", placeItems: "center" }}><Icon name="plus" /></span>
          New concept
        </button>
      </div>

      <div style={{ padding: "0 16px 6px", fontSize: 11, color: "var(--hint)", display: "flex", justifyContent: "space-between" }}>
        <span>Deployment</span>
      </div>
      <div style={{ margin: "0 12px 14px" }}>
        <DeploymentSwitcher current={domain} currentHash={bundleHash} peers={peers} />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "0 12px 12px" }}>
        {error && (
          <p style={{ padding: "8px 4px", fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>{error}</p>
        )}
        {!error && groups.length === 0 && (
          <p style={{ padding: "8px 4px", fontSize: 12, color: "var(--hint)", lineHeight: 1.5 }}>
            This bundle has no concepts yet. Approved proposals appear here.
          </p>
        )}
        {groups.map(([type, items]) => (
          <div key={type}>
            <div className="tree-group">
              <span>{humanizeType(type)}</span>
              <span>{items.length}</span>
            </div>
            {items.map((it) => {
              // A concept you cannot read is still listed — you have to be able to see
              // that it exists before you can ask for it.
              const locked = isRestricted(it.classifications) && !canViewPII;
              return (
                <Link key={it.id} href={`/c/${it.id}`} className="tree-item" data-active={it.id === current}>
                  <span className="label">{it.title}</span>
                  {locked ? (
                    <span style={{ color: "var(--hint)", display: "grid", placeItems: "center" }} title="Restricted">
                      <Icon name="lock" size={12} />
                    </span>
                  ) : (
                    // Published is a filled dot; anything still in flight is an open ring.
                    <i className={it.status.toLowerCase() === "published" ? "dot" : "dot-draft"} title={it.status} />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
          fontSize: 12, color: "var(--ink-2)", borderTop: "1px solid var(--line)"
        }}
      >
        <i className="dot" />
        <span>Agents connected</span>
        <span style={{ marginLeft: "auto", color: "var(--hint)" }}>
          <Link href="/govern" style={{ color: "inherit" }}>Audit</Link>
          {" · "}
          <Link href="/govern?reviewer=1" style={{ color: "inherit" }}>Admin</Link>
        </span>
      </div>
    </aside>
  );
}
