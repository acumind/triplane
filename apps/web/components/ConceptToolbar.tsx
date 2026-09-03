"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Menu } from "./Menu";
import { emitAsk } from "../lib/bus";
import { isSubscribed, toggleSubscription } from "../lib/prefs";
import { copyText } from "../lib/clipboard";
import { useReviewerMode } from "../lib/reviewer";
import { usePermissions } from "../lib/permissions";

/**
 * The sticky bar's actions. Each one does something real: Subscribe is a per-viewer
 * preference, Share copies the link, Export links the formats this site actually serves,
 * History jumps to the change list on the page, and the permission-gated items under
 * More are disabled — with the reason — rather than silently doing nothing.
 */
export function ConceptToolbar({
  conceptId,
  title,
  path,
  owner,
  restricted
}: {
  conceptId: string;
  title: string;
  path: string;
  owner?: string;
  restricted: boolean;
}) {
  const [subscribed, setSubscribed] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "ok" | "fail">("idle");
  const reviewer = useReviewerMode();
  const { canViewPII } = usePermissions();
  const locked = restricted && !canViewPII;
  const router = useRouter();

  // Read after mount: localStorage does not exist while the HTML is being rendered.
  useEffect(() => setSubscribed(isSubscribed(conceptId)), [conceptId]);
  useEffect(() => {
    if (shareState === "idle") return;
    const t = setTimeout(() => setShareState("idle"), 1800);
    return () => clearTimeout(t);
  }, [shareState]);

  const share = async () => setShareState((await copyText(window.location.href)) ? "ok" : "fail");

  const jump = (hash: string) => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
      <button
        className="icon-btn"
        style={{ width: 30, height: 30, color: subscribed ? "var(--ink)" : undefined }}
        data-tip={subscribed ? "Unsubscribe" : "Subscribe"}
        aria-label={subscribed ? "Unsubscribe" : "Subscribe"}
        aria-pressed={subscribed}
        onClick={() => setSubscribed(toggleSubscription(conceptId))}
      >
        <Icon name="bell" />
      </button>

      <button
        className="icon-btn"
        style={{ width: 30, height: 30 }}
        data-tip={shareState === "ok" ? "Link copied" : shareState === "fail" ? "Copy blocked — select the address bar" : "Share"}
        aria-label="Copy link to this concept"
        onClick={share}
      >
        <Icon name="share" />
      </button>

      <Menu
        label="Export"
        tip="Export"
        items={[
          {
            label: "Markdown",
            href: locked ? undefined : `/api/bundle?path=${encodeURIComponent(path)}`,
            disabled: locked,
            note: locked ? "restricted" : "source"
          },
          { label: "JSON", href: "/graph.json", note: "graph" },
          { label: "Catalog", href: "/.well-known/ai-catalog.json", note: "ARD" }
        ]}
      >
        <Icon name="download" />
      </Menu>

      <button
        className="icon-btn"
        style={{ width: 30, height: 30 }}
        data-tip="History"
        aria-label="Jump to recent changes"
        onClick={() => jump("recent-changes")}
      >
        <Icon name="history" />
      </button>

      <Menu
        label="More actions"
        tip="More"
        items={[
          {
            label: "Report an issue",
            onSelect: () =>
              emitAsk(`I think ${title} (${conceptId}) is wrong or out of date because `)
          },
          {
            // Only meaningful when something is actually withheld from you.
            label: "Request access",
            disabled: !locked,
            note: locked ? undefined : restricted ? "you have access" : "nothing restricted",
            onSelect: () => emitAsk(`Request access to ${title} (${conceptId}) because `)
          },
          {
            label: "Deprecate",
            disabled: !reviewer,
            note: reviewer ? undefined : "reviewer only",
            onSelect: () =>
              emitAsk(
                `Propose deprecating ${conceptId}: draft the replacement note and what should link to instead.`
              )
          },
          { label: owner ? `Owner: ${owner}` : "No owner declared", disabled: true }
        ]}
      >
        <Icon name="more" />
      </Menu>

      <button
        className="btn-secondary"
        style={{ marginLeft: 8 }}
        onClick={() =>
          reviewer
            ? emitAsk(`Draft a change to ${conceptId} (${title}) that `)
            : router.push("/govern")
        }
        data-tip={reviewer ? "Draft a change for review" : "Opens the review queue"}
      >
        Propose change
      </button>
    </div>
  );
}
