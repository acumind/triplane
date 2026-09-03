import Link from "next/link";

/** A concept that isn't in the bundle is genuinely absent — say so with a 404, not a 200. */
export default function NotFound() {
  return (
    <main>
      <h1>Not in this bundle</h1>
      <p style={{ color: "var(--ink-2)" }}>
        No published concept lives at this address. It may have been renamed, or it may still be
        waiting in the <Link href="/govern">review queue</Link> — nothing appears here until it is approved.
      </p>
      <p><Link href="/">← Back to the graph</Link></p>
    </main>
  );
}
