"use client";
import { useStoredMode, writeMode } from "./mode";
import { useReviewerMode } from "./reviewer";

/**
 * The permission stub the handoff names: canEdit, canPublish, canViewPII.
 *
 * Two toggles, both on the same store as reviewer mode, because there is no auth here
 * and pretending otherwise would be worse than a stub:
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
const ACCEPTS = ["reader", "full"] as const;

/**
 * Flip access in place. Nothing in the UI calls this yet — access is switched by URL,
 * as the handoff's no-access state describes — but it exists so a switcher does not have
 * to reach past the store and reintroduce the stale-read it was written to avoid.
 */
export function setAccessMode(mode: (typeof ACCEPTS)[number]) {
  writeMode(KEY, mode);
}

export function usePermissions(): Permissions {
  const reviewer = useReviewerMode();
  // Unset reads as full access, which is also the server-render default.
  const reader = useStoredMode(KEY, "access", ACCEPTS) === "reader";
  return { canEdit: reviewer, canPublish: reviewer, canViewPII: reviewer || !reader };
}
