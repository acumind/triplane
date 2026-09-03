"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { bus } from "../lib/bus";
import { loadGraph } from "./WebMCPProvider";

const ForceGraph = dynamic(() => import("./ForceGraphClient"), { ssr: false });

/**
 * The demo surface: monochrome graph where agent activity is the only colour.
 *
 * Everything drawn here reads its colours from the CSS tokens rather than literals,
 * because those tokens carry `brand.accent` — a hardcoded highlight would keep glowing
 * the previous tenant's colour on a re-branded deployment.
 */

type Tokens = { paper: string; ink: string; ink2: string; rule: string; rule2: string; agent: string };
const FALLBACK: Tokens = { paper: "#ffffff", ink: "#1a1a1a", ink2: "#8a8a8a", rule: "#ececec", rule2: "#d6d6d6", agent: "#2fb344" };

function readTokens(): Tokens {
  if (typeof window === "undefined") return FALLBACK;
  const s = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    paper: get("--ground", FALLBACK.paper),
    ink: get("--ink", FALLBACK.ink),
    ink2: get("--hint", FALLBACK.ink2),
    rule: get("--line", FALLBACK.rule),
    rule2: get("--rule", FALLBACK.rule2),
    agent: get("--status", FALLBACK.agent)
  };
}

/** Canvas needs a real font stack; it cannot resolve a CSS custom property. */
const SANS = '"Avenir Next", Seravek, Corbel, system-ui, sans-serif';

/** A link endpoint is a string before the simulation runs and an object after it. */
const endId = (v: any): string => (v && typeof v === "object" ? v.id : v);

/**
 * Minimal collision so nodes don't stack. d3-force isn't in the dependency tree (the
 * graph library bundles its own), and at bundle scale this is ~n²/2 checks per tick —
 * 66 for the demo graph. Not worth a dependency; revisit past a few hundred nodes.
 */
function collide(radius: number) {
  let nodes: any[] = [];
  const force = (alpha: number) => {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        if (d < radius * 2) {
          const push = (((radius * 2 - d) / d) * alpha) / 2;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
  };
  force.initialize = (n: any[]) => { nodes = n; };
  return force;
}

export function GraphView({
  height = 320,
  focus,
  bordered = false
}: {
  height?: number;
  /** Show only this concept and its immediate neighbours — the whole graph is
   *  unreadable in a side panel, and the local structure is what the page is about. */
  focus?: string;
  bordered?: boolean;
}) {
  const [data, setData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [lit, setLit] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reloads, setReloads] = useState(0);
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  // Label rectangles already drawn this frame. Labels are the thing that makes a graph
  // readable or useless, and constant-size text on a zoomed-out layout collides badly —
  // so a label that would overlap one already placed simply yields.
  const placed = useRef<{ x1: number; y1: number; x2: number; y2: number }[]>([]);

  // Read once per render pass, never per node per frame — getComputedStyle in a canvas
  // draw callback runs 12× per tick and forces style recalculation each time.
  const tk = useMemo(() => (width ? readTokens() : FALLBACK), [width]);

  useEffect(() => {
    setState("loading");
    loadGraph().then((g) => {
      let nodes = g.nodes;
      let edges = g.edges;
      if (focus) {
        const near = new Set([focus]);
        for (const e of g.edges) {
          if (e.from === focus) near.add(e.to);
          if (e.to === focus) near.add(e.from);
        }
        nodes = g.nodes.filter((n) => near.has(n.id));
        edges = g.edges.filter((e) => near.has(e.from) && near.has(e.to));
      }
      setData({
        nodes: nodes.map((n) => ({ id: n.id, name: n.title, type: n.type, focus: n.id === focus })),
        links: edges.map((e) => ({ source: e.from, target: e.to, rel: e.rel }))
      });
      setState("ready");
    }).catch(() => setState("error"));
    // No timed fade. The highlight is the agent showing its path, and the answer it
    // belongs to takes far longer to arrive than any fade — an eight-second timer meant
    // the graph was already dark by the time there was anything to read next to it.
    // A new question clears it (AskPanel emits an empty set), which is the honest moment.
    const onHi = (e: Event) => setLit(new Set((e as CustomEvent<string[]>).detail));
    bus?.addEventListener("highlight", onHi);
    return () => bus?.removeEventListener("highlight", onHi);
  }, [focus, reloads]);

  // Track the container: without an explicit width the canvas keeps the library's
  // default and stops matching the page — including when the sidebar opens or closes.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * Size the LAYOUT to the container instead of moving the camera to the layout.
   *
   * The library's zoomToFit proved unreliable here — a silent no-op on the empty graph
   * the engine settles on before data arrives, and no observable effect once data did
   * arrive. Rather than keep chasing the camera, leave it at its default (centred on the
   * origin, zoom 1) and tune the forces so the layout lands at roughly the size of the
   * box. Deterministic, and there is no settle-timing to race.
   */
  const onReady = useCallback(
    (instance: any) => {
      fg.current = instance;
      const span = Math.max(height, 200);
      instance.d3Force("charge")?.strength(-span * 0.5).distanceMax(span * 1.2);
      instance.d3Force("link")?.distance(span * 0.17).strength(0.7);
      instance.d3Force("collide", collide(span * 0.055));
      instance.d3ReheatSimulation();
    },
    [height]
  );

  return (
    <div
      ref={wrap}
      style={
        bordered
          ? { border: `1px solid ${tk.rule}`, height, background: tk.paper }
          : { borderBottom: `1px solid ${tk.rule}`, height, background: tk.paper }
      }
    >
      {/* A canvas that silently stays blank is indistinguishable from a broken one. */}
      {(state !== "ready" || data.nodes.length === 0) && (
        <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 16, textAlign: "center" }}>
          {state === "loading" && <span style={{ color: "var(--hint)", fontSize: 13 }}>Loading graph…</span>}
          {state === "error" && (
            <span style={{ color: "var(--ink-2)", fontSize: 13, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
              The graph could not be loaded.
              <button className="btn-secondary" onClick={() => setReloads((n) => n + 1)}>Retry</button>
            </span>
          )}
          {state === "ready" && data.nodes.length === 0 && (
            <span style={{ color: "var(--hint)", fontSize: 13 }}>
              {focus ? "This concept has no connections to plot." : "No concepts to plot yet."}
            </span>
          )}
        </div>
      )}
      {state === "ready" && data.nodes.length > 0 && width > 0 && (
        <ForceGraph
          onReady={onReady}
          graphData={data}
          width={width}
          height={height}
          backgroundColor={tk.paper}
          nodeRelSize={5}
          cooldownTicks={120}
          nodeLabel={(n: any) => `${n.name} (${n.type})`}
          onRenderFramePre={() => { placed.current = []; }}
          nodeCanvasObject={(n: any, ctx: CanvasRenderingContext2D, scale: number) => {
            const hot = lit.has(n.id);
            const here = n.focus === true;
            // Every dimension is divided by the zoom so it is constant on screen. A radius
            // in graph units looks right at one zoom only: zoomToFit picks whatever scale
            // the layout needs, and a wide flat subgraph in a short band scales up ~5x,
            // which turns graph-unit nodes into blobs.
            const r = (hot || here ? 6 : 4) / scale;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = hot ? tk.agent : tk.ink;
            ctx.fill();
            if (hot || here) {
              // "You are here" is a ring, not a colour — the accent stays reserved
              // for agent activity (guardrail 6).
              ctx.lineWidth = 1.5 / scale;
              ctx.strokeStyle = tk.ink;
              ctx.stroke();
              if (here && !hot) {
                ctx.beginPath();
                ctx.arc(n.x, n.y, r + 4 / scale, 0, 2 * Math.PI);
                ctx.lineWidth = 1 / scale;
                ctx.strokeStyle = tk.rule2;
                ctx.stroke();
              }
            }
            const priority = hot || here;

            // Constant on-screen size: dividing by the zoom keeps labels readable at
            // every scale, where a fixed graph-space size renders them ~4px.
            const font = (priority ? 11 : 10) / scale;
            ctx.font = `${font}px ${SANS}`;
            const label = n.name as string;
            const w = ctx.measureText(label).width;
            const pad = 2 / scale;
            const x = n.x + (priority ? 11 : 9) / scale;
            const y = n.y + font / 3;
            const rect = { x1: x - pad, y1: y - font, x2: x + w + pad, y2: y + font * 0.3 };

            // Priority labels always draw; ordinary ones yield to whatever got there first.
            const clash = placed.current.some(
              (r) => rect.x1 < r.x2 && rect.x2 > r.x1 && rect.y1 < r.y2 && rect.y2 > r.y1
            );
            if (clash && !priority) return;
            placed.current.push(rect);

            // Paper backing so a label crossing an edge stays legible.
            ctx.fillStyle = tk.paper;
            ctx.globalAlpha = 0.9;
            ctx.fillRect(rect.x1, rect.y1, rect.x2 - rect.x1, rect.y2 - rect.y1);
            ctx.globalAlpha = 1;
            ctx.fillStyle = priority ? tk.ink : tk.ink2;
            ctx.fillText(label, x, y);
          }}
          // Without this the hit area falls back to nodeRelSize and stops matching the
          // circle we actually drew, so clicks land next to the node instead of on it.
          nodePointerAreaPaint={(n: any, color: string, ctx: CanvasRenderingContext2D, scale: number) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x, n.y, 9 / scale, 0, 2 * Math.PI); // matches the drawn radius plus a little
            ctx.fill();
          }}
          linkColor={(l: any) => (lit.has(endId(l.source)) && lit.has(endId(l.target)) ? tk.agent : tk.rule2)}
          linkWidth={(l: any) => (lit.has(endId(l.source)) && lit.has(endId(l.target)) ? 2.5 : 1)}
          linkDirectionalArrowLength={0}
          onNodeClick={(n: any) => router.push(`/c/${n.id}`)}
        />
      )}
    </div>
  );
}
