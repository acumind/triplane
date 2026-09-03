"use client";
import type { Proposal, ProposalSink } from "@triplane/engine";

/**
 * The browser's half of the write plane. `propose_concept` runs client-side, so it cannot
 * hold a real store — it holds this, which POSTs to /api/govern and lets the server do the
 * writing. The server re-validates: a client-side check is a courtesy, not a gate.
 */
export const remoteStore: ProposalSink = {
  async propose({ path, content, message }): Promise<Proposal> {
    const res = await fetch("/api/govern", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "propose", path, markdown: content, message })
    });
    const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
    if (!res.ok || data.error) throw new Error(data.error ?? `Proposal rejected (${res.status})`);
    if (data.issues?.length) throw new Error(`Proposal failed lint: ${data.issues.join("; ")}`);
    return data.proposal as Proposal;
  }
};
