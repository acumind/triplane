"use client";
import { useStoredMode, writeMode } from "./mode";

/**
 * Reviewer mode is a toggle, not an account: `?reviewer=1` turns it on for this browser,
 * `?reviewer=0` off. It gates *affordances* — the write tool, the Propose button, the
 * /govern link — and never the gate itself. Nothing here can publish; approval still
 * runs through /api/govern and a human's click. Real auth is a post-hackathon concern.
 */
const KEY = "triplane.reviewer";
const ACCEPTS = ["0", "1"] as const;

/** Flip the mode in place, for a control on the page the mode is being read on. */
export function setReviewerMode(on: boolean) {
  writeMode(KEY, on ? "1" : "0");
}

export function useReviewerMode(): boolean {
  // Off until the store has been read, so the first client render matches the HTML.
  return useStoredMode(KEY, "reviewer", ACCEPTS) === "1";
}
