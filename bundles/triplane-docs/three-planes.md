---
id: three-planes
type: term
title: The three planes
links:
  - { to: okf-bundles, rel: depends_on }
  - { to: tool-contract, rel: mentions }
---
**Plane 1 — humans:** rendered concept pages plus a graph explorer.
**Plane 2 — in-page agents:** the [[tool-contract]] registered via WebMCP in the
user's own session.
**Plane 3 — ecosystem:** `/.well-known/ai-catalog.json`, `llms.txt`, an MCP server,
and the raw bundle for agents that discover the site via ARD.

All three render from one build of the same [[okf-bundles]] — a commit updates them together.
