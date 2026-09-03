"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useReviewerMode } from "../lib/reviewer";

/** Reviewer-only links stay hidden for readers — the console is still reachable by URL,
 *  because reviewer mode hides affordances and is not the security boundary. */
export function TopNav() {
  const pathname = usePathname();
  const reviewer = useReviewerMode();
  return (
    <nav>
      <Link href="/" data-active={pathname === "/"}>Graph</Link>
      {reviewer && (
        <Link href="/govern" data-active={pathname === "/govern"}>Review queue</Link>
      )}
    </nav>
  );
}
