"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Graph } from "@triplane/engine";
import { loadGraph } from "./WebMCPProvider";
import { humanizeType } from "../lib/display";
import { shellDestinations } from "../lib/destinations";

/**
 * ⌘K search over concepts, owners and columns — and over the shell's own destinations,
 * so the sandbox and the plane-3 artifacts are reachable from the keyboard as well as
 * from the sidebar. Both read the same list; neither can drift from the other.
 *
 * Searches graph.json, which the shell already has — no endpoint, no index to keep in
 * step with the bundle. Matching on the column names inside a table's frontmatter is
 * what makes "home_region" findable, which is how people actually look for a table.
 */
interface Hit {
  id: string;
  title: string;
  type: string;
  why?: string;
  /** Set for a shell destination; concepts route to /c/<id>. */
  href?: string;
  /** A build artifact, not a route: hand it to the browser rather than to the router. */
  external?: boolean;
}

export function CommandPalette({ landing }: { landing: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [nodes, setNodes] = useState<Graph["nodes"]>([]);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    loadGraph().then((g) => setNodes(g.nodes)).catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    // The sidebar's search button opens the same palette.
    const onOpen = () => setOpen(true);
    document.addEventListener("triplane:search", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("triplane:search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    const scored: (Hit & { score: number })[] = [];

    // Destinations first: the palette is where someone looks when they don't know what
    // the app has, so it should answer that. On an empty query only the views are listed —
    // the four machine artifacts would push concepts out of a 12-row list for no one's
    // benefit, and anyone after those is searching for them by name.
    const { views, machine } = shellDestinations(landing);
    for (const d of needle ? [...views, ...machine] : views) {
      const label = d.label.toLowerCase();
      if (needle && !label.includes(needle) && !d.href.toLowerCase().includes(needle)) continue;
      scored.push({
        id: d.id, title: d.label, type: "destination", why: d.note ?? "go to",
        href: d.href, external: d.external,
        score: !needle || label.startsWith(needle) ? 4 : 3.5
      });
    }

    for (const n of nodes) {
      const fm = n.frontmatter as any;
      const base = { id: n.id, title: n.title, type: n.type };
      if (!needle) {
        scored.push({ ...base, score: 0 });
        continue;
      }
      const title = n.title.toLowerCase();
      const owner = String(fm?.owner ?? "").toLowerCase();
      const column = (fm?.columns ?? []).find((c: any) => String(c?.name ?? "").toLowerCase().includes(needle));
      if (title.includes(needle)) scored.push({ ...base, score: title.startsWith(needle) ? 3 : 2 });
      else if (n.id.includes(needle)) scored.push({ ...base, score: 2 });
      else if (n.type.includes(needle)) scored.push({ ...base, score: 1, why: `type ${humanizeType(n.type)}` });
      else if (owner.includes(needle)) scored.push({ ...base, score: 1, why: `owner ${fm.owner}` });
      else if (column) scored.push({ ...base, score: 1, why: `column ${column.name}` });
    }
    return scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 12);
  }, [q, nodes, landing]);

  const go = useCallback(
    (h?: Hit) => {
      if (!h) return;
      setOpen(false);
      if (h.external) window.location.href = h.href!;
      else router.push(h.href ?? `/c/${h.id}`);
    },
    [router]
  );

  if (!open) return null;

  return (
    <div className="palette-backdrop" onMouseDown={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Search concepts">
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            if (e.key === "Enter") { e.preventDefault(); go(hits[active]); }
          }}
          placeholder="Search concepts, owners, columns, or go to…"
          aria-label="Search concepts, owners, columns, or go to a view"
        />
        <div className="palette-list">
          {failed && <div className="palette-empty">The concept index could not be loaded.</div>}
          {!failed && hits.length === 0 && nodes.length === 0 && <div className="palette-empty">Loading concepts…</div>}
          {!failed && hits.length === 0 && nodes.length > 0 && (
            <div className="palette-empty">No concept matches “{q}”.</div>
          )}
          {hits.map((h, i) => (
            <button
              key={h.id}
              className="palette-item"
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h)}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title}</span>
              <span style={{ color: "var(--hint)", fontSize: 11 }}>{h.why ?? humanizeType(h.type)}</span>
            </button>
          ))}
        </div>
        <div className="palette-foot">
          <span>↑↓ to move · ↵ to open · esc to close</span>
          <span style={{ marginLeft: "auto" }}>{hits.length} shown</span>
        </div>
      </div>
    </div>
  );
}
