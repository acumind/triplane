---
id: tool-contract
type: term
title: The tool contract
links:
  - { to: okf-bundles, rel: depends_on }
---
Tools are defined once in `packages/engine/src/tools.ts` and mounted on two transports:
WebMCP in the browser (read + ui + write) and a hosted MCP server (read only). The
asymmetry is deliberate — UI actuation and writes never leave the browser, and every
write is a proposal into the [[governance-gate]], never a direct publish.
