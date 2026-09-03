---
id: getting-started
type: runbook
title: Getting started
links:
  - { to: okf-bundles, rel: mentions }
  - { to: what-is-triplane, rel: mentions }
---
1. `npm install`
2. `npm run build:meridian` (or `build:docs`) — compiles the bundle (see [[okf-bundles]]).
3. `npm run web` — the site, sidebar agent, and Plane-3 endpoints on `localhost:3000`.
4. `tsx packages/cli/src/ard-agent.ts http://localhost:3000 "your question"` — the
   external-agent loop against your running instance of [[what-is-triplane]].
