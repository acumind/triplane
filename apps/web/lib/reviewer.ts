"use client";
import { useEffect, useState } from "react";

/**
 * Reviewer mode is a toggle, not an account: `?reviewer=1` turns it on for this browser,
 * `?reviewer=0` off. It gates *affordances* — the write tool, the Propose button, the
 * /govern link — and never the gate itself. Nothing here can publish; approval still
 * runs through /api/govern and a human's click. Real auth is a post-hackathon concern.
 */
const KEY = "triplane.reviewer";

export function useReviewerMode(): boolean {
  // Always false on the server so the first client render matches the HTML.
  const [on, setOn] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("reviewer");
    if (q === "1" || q === "0") localStorage.setItem(KEY, q);
    setOn(localStorage.getItem(KEY) === "1");
  }, []);

  return on;
}
