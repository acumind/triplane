# ▲ Triplane

**Publish once. Humans read it, agents drive it, the ecosystem discovers it.**

Triplane is a white-label publishing engine for the agentic web. Feed it one
[OKF](https://github.com/google/open-knowledge-format)-style bundle of markdown-with-frontmatter,
and one build emits three planes from the same graph:

```
                      ┌── Plane 1 · Humans ──────────────┐
                      │  concept pages + graph explorer  │
  OKF bundle ──build──┤── Plane 2 · In-page agents ──────┤
  (markdown graph)    │  WebMCP tools in the user's tab  │
                      ├── Plane 3 · Ecosystem ───────────┤
                      │  /.well-known/ai-catalog.json,   │
                      │  llms.txt, MCP server, raw OKF   │
                      └──────────────────────────────────┘
```

Writes flow the other way through one gate: agents and editors can only **propose**;
a human **approves**; approval is the deploy. Authors never see git; git sees everything.

## Quickstart

```bash
npm install
npm run build:meridian     # compile the demo bundle (fictional retailer analytics)
npm run web                # site + sidebar agent + Plane-3 endpoints on :3000
```

Ask the sidebar: *"How is weekly active users computed, end to end?"* — and watch the
graph light up the reasoning path.

Prove Plane 3 from outside:

```bash
ANTHROPIC_API_KEY=sk-... npx tsx packages/cli/src/ard-agent.ts http://localhost:3000 \
  "How is weekly active users computed?"
```

Flip the whole product to its own documentation (`TRIPLANE_BUNDLE=triplane-docs npm run web`
after `npm run build:docs`) — Triplane's docs are themselves a Triplane instance. That's
the white-label proof: `npm run greptest` shows the engine holds zero bundle references.

## Layout

```
bundles/            OKF content: meridian (demo), triplane-docs (self-hosting)
packages/engine     compiler, tool contract, WebMCP/MCP adapters, stores, catalogs
packages/cli        build pipeline + reference external ARD agent
apps/web            Next.js app: pages, graph view, sidebar agent, API routes
docs/               full spec + personas
CLAUDE.md           build state, guardrails, task list
```

Built for a WebMCP hackathon. Licensed under the Apache License, Version 2.0.
