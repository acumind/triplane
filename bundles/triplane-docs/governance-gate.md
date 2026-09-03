---
id: governance-gate
type: policy
title: The governance gate
links:
  - { to: okf-bundles, rel: governs }
---
Every write — human editor or agent `propose_concept` — becomes a proposal. A reviewer
sees the rendered diff and approves or rejects. **Approval is the deploy**: the merge is
the only write path to main, the build reruns, and all [[three-planes]] update.
Authors never see git; git sees everything.
