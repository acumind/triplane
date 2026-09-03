"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useReviewerMode } from "../lib/reviewer";

/**
 * The /govern link is reviewer-only: a reader should never be shown a door they have
 * no reason to open. The console itself is still reachable by URL — reviewer mode
 * hides affordances, it is not the security boundary.
 */
export function ReviewerNav() {
  const reviewer = useReviewerMode();
  const pathname = usePathname();
  if (!reviewer || pathname === "/govern") return null;
  return (
    <Link href="/govern" style={{ marginLeft: "auto", fontSize: ".85rem" }}>
      Review queue
    </Link>
  );
}
