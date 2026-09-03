"use client";
import type { ReactNode } from "react";
import { usePermissions } from "../lib/permissions";
import { NoAccess } from "./NoAccess";

/**
 * Hides a region behind the permission stub.
 *
 * This is a DISPLAY gate, not a security boundary — the same honesty reviewer mode is
 * held to. The markup still reaches the browser, so a real deployment must withhold
 * restricted content server-side, keyed on a session the server can actually see rather
 * than a flag this browser sets about itself.
 */
export function Gated({
  restricted,
  what,
  conceptId,
  title,
  owner,
  children
}: {
  restricted: boolean;
  what: string;
  conceptId: string;
  title: string;
  owner?: string;
  children: ReactNode;
}) {
  const { canViewPII } = usePermissions();
  if (!restricted || canViewPII) return <>{children}</>;
  return <NoAccess what={what} conceptId={conceptId} title={title} owner={owner} />;
}
