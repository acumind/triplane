/**
 * The quiet states — empty, loading, error, and the "not built yet" case.
 *
 * One component so a missing schema and a failed graph fetch read the same way: a short
 * line in the flow of the document, never a coloured banner. Colour is reserved for
 * status dots, and an error is not a status.
 */
export function Notice({
  children,
  action,
  inset = false
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  /** Boxed, for a region that would otherwise collapse to nothing. */
  inset?: boolean;
}) {
  return (
    <div
      style={
        inset
          ? {
              border: "1px solid var(--line)", borderRadius: 6, padding: "16px 18px",
              color: "var(--ink-2)", fontSize: 13, display: "flex", gap: 12,
              alignItems: "center", flexWrap: "wrap", marginBottom: 16
            }
          : { color: "var(--hint)", fontSize: 13, margin: "0 0 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }
      }
    >
      <span>{children}</span>
      {action}
    </div>
  );
}
