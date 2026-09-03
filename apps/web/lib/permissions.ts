"use client";
import { useEffect, useState } from "react";
import { useReviewerMode } from "./reviewer";

/**
 * The permission stub the handoff names: canEdit, canPublish, canViewPII.
 *
 * Two toggles, both the same query-param + localStorage pattern as reviewer mode, because
 * there is no auth here and pretending otherwise would be worse than a stub:
 *   ?reviewer=1  → canEdit, canPublish (drafting and approving)
 *   ?access=reader → revokes canViewPII, so restricted concepts render their no-access state
 *
 * canViewPII is granted by DEFAULT. Gating it on reviewer mode would lock the schema for
 * every ordinary reader, which is the opposite of what a knowledge base is for — the
 * restriction is the exception you switch into, not the resting state.
 */
export interface Permissions {
  canEdit: boolean;
  canPublish: boolean;
  canViewPII: boolean;
}

const KEY = "triplane.access";

export function usePermissions(): Permissions {
  const reviewer = useReviewerMode();
  // Always false on the server so the first client render matches the HTML.
  const [reader, setReader] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("access");
    if (q === "reader" || q === "full") localStorage.setItem(KEY, q);
    try {
      setReader(localStorage.getItem(KEY) === "reader");
    } catch {
      setReader(false);
    }
  }, []);

  return { canEdit: reviewer, canPublish: reviewer, canViewPII: reviewer || !reader };
}
