"use client";
import { useEffect } from "react";

/**
 * The document-level error state.
 *
 * There is deliberately no matching loading.tsx. A loading boundary makes the route
 * stream, which commits the 200 before the page can call notFound() — an unknown concept
 * then answers 200 with "Not in this bundle", which is exactly the lie the 404 was added
 * to stop. A concept renders in ~30ms from a file read, so the boundary bought nothing.
 * The genuine loading states are client-side, where something is actually fetched:
 * the graph, the command palette and the Ask panel.
 *
 * The overwhelmingly likely cause here is a missing or stale `public/graph.json` — a
 * fresh clone that has not been built yet — so the message names that first instead of
 * showing a stack trace to someone who cannot act on one.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[triplane] page error:", error);
  }, [error]);

  const notBuilt = /graph\.json|ENOENT|no such file/i.test(error.message);

  return (
    <div className="doc">
      <h1>This page could not be rendered</h1>
      <p style={{ color: "var(--ink-body)" }}>
        {notBuilt
          ? "The compiled bundle is missing. Run npm run build:meridian (or build:docs) to produce public/graph.json, then reload."
          : "Something went wrong rendering this concept."}
      </p>
      <pre className="machine" style={{ whiteSpace: "pre-wrap" }}>{error.message}</pre>
      <button className="btn-secondary" onClick={reset}>Try again</button>
    </div>
  );
}
