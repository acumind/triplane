"use client";
/** Tiny event bus: WebMCP ui-tools dispatch, GraphView + pages listen. */
export const bus = typeof window !== "undefined" ? new EventTarget() : (null as unknown as EventTarget);

export const emitHighlight = (ids: string[]) => bus?.dispatchEvent(new CustomEvent("highlight", { detail: ids }));

/** Seed the Ask composer from elsewhere in the shell (New concept, Propose change). */
export const emitAsk = (text: string, send = false) =>
  bus?.dispatchEvent(new CustomEvent("ask", { detail: { text, send } }));
