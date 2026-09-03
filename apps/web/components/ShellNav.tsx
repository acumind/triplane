"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { Menu } from "./Menu";
import { shellDestinations } from "../lib/destinations";
import { copyText } from "../lib/clipboard";
import { useReviewerMode, setReviewerMode } from "../lib/reviewer";
import { usePermissions, setAccessMode } from "../lib/permissions";

/**
 * The rest of the app, in the sidebar.
 *
 * The tree above this covers concepts. Everything else the shell can open — the index,
 * the review queue, the sandbox, the three plane-3 artifacts — was reachable only by
 * typing a URL, or from the product landing page that tenant deployments deliberately do
 * not show. Same for the two demo switches, which lived entirely in query params.
 *
 * Nothing here is new capability; it is the capability that already existed, given a
 * door. The rows sit below the tree so the top of the sidebar stays about the knowledge
 * and the bottom about the machine.
 */
export function ShellNav({ landing }: { landing: boolean }) {
  const pathname = usePathname();
  const reviewer = useReviewerMode();
  const { canViewPII } = usePermissions();
  const { views, machine } = shellDestinations(landing);

  // What this browser currently is, in the two words a demo needs. Reviewer wins because
  // it is the stronger claim: a reviewer always sees restricted content.
  const role = reviewer ? "reviewer" : canViewPII ? "reader" : "restricted reader";

  return (
    <nav style={{ padding: "6px 12px 8px", borderTop: "1px solid var(--line)" }} aria-label="Views">
      {views.map((d) => (
        <Link key={d.id} href={d.href} className="tree-item" data-active={pathname === d.href}>
          <span style={{ color: "var(--ink-3)", display: "grid", placeItems: "center" }}>
            <Icon name={d.icon} />
          </span>
          <span className="label">{d.label}</span>
        </Link>
      ))}

      <Menu
        variant="row"
        align="left"
        drop="up"
        width={196}
        tip="The same bundle, as machines read it"
        label="Machine planes"
        items={[
          ...machine.map((d) => ({ label: d.label, href: d.href, note: d.note })),
          // POST-only, so there is nothing to open — the useful thing is the URL itself.
          { label: "MCP endpoint", note: "copy", onSelect: () => copyText(`${window.location.origin}/api/mcp`) }
        ]}
      >
        <span style={{ color: "var(--ink-3)", display: "grid", placeItems: "center" }}>
          <Icon name="braces" />
        </span>
        <span style={{ flex: 1 }}>Machine planes</span>
        <span style={{ color: "var(--ink-3)", display: "grid", placeItems: "center" }}>
          <Icon name="chevron" size={12} />
        </span>
      </Menu>

      <Menu
        variant="row"
        align="left"
        drop="up"
        width={196}
        tip="Switch who this browser is"
        label="Viewing as"
        items={[
          {
            label: "Reviewer mode",
            note: reviewer ? "on" : "off",
            onSelect: () => setReviewerMode(!reviewer)
          },
          {
            // Named for what it does, not for the flag: "reader" alone sounds like a role
            // you are, when it is a restriction you switch on to watch the gate work.
            label: "Hide restricted",
            note: reviewer ? "reviewer sees all" : canViewPII ? "off" : "on",
            disabled: reviewer,
            onSelect: () => setAccessMode(canViewPII ? "reader" : "full")
          }
        ]}
      >
        <span style={{ color: "var(--ink-3)", display: "grid", placeItems: "center" }}>
          <Icon name="user" />
        </span>
        <span style={{ flex: 1 }}>Viewing as {role}</span>
        <span style={{ color: "var(--ink-3)", display: "grid", placeItems: "center" }}>
          <Icon name="chevron" size={12} />
        </span>
      </Menu>
    </nav>
  );
}
