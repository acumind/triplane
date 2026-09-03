# Deploying to Vercel

Four projects on one repo, differing only by `TRIPLANE_BUNDLE`. Everything below was
prepared and checked locally; the Vercel clicking is yours.

## What is already handled

- `vercel.json` sets the build: `npm run build:bundle && npm run build --workspace apps/web`.
  The bundle **must** compile into `apps/web/public/` before `next build`, and this is what
  guarantees the order.
- `TRIPLANE_DOMAIN` falls back to `VERCEL_PROJECT_PRODUCTION_URL` then `VERCEL_URL`, so each
  deployment — previews included — advertises its own origin in the catalog with nothing to
  set by hand.
- `outputFileTracingIncludes` carries `public/graph.json` and `public/bundle/**` into the
  serverless functions. 72 KB per deployment.
- Plane 3 sends CORS, so a browser-based agent can actually perform ARD discovery.

## Per project

Create four projects from `acumind/triplane`. Root directory: the **repo root** (the build
needs `bundles/` and `packages/`). Node **24**, matching `engines` and CI.

| Project | `TRIPLANE_BUNDLE` |
|---|---|
| meridian | `meridian` |
| triplane | `triplane-docs` |
| controls | `controls` |
| dhruva | `dhruva` |

Environment variables on **each** project:

| Variable | Value | Notes |
|---|---|---|
| `TRIPLANE_BUNDLE` | per the table | the only difference between the four |
| `ANTHROPIC_API_KEY` | your key | server-side only; `/api/agent` is why it never reaches the browser |
| `GITHUB_TOKEN` | a PAT with `repo` scope | **not** `gh auth token` — that is a short-lived OAuth token and will expire mid-demo |
| `TRIPLANE_REPO` | `acumind/triplane` | with `GITHUB_TOKEN`, this switches the write plane to PR-as-proposal |
| `TRIPLANE_PEERS` | see pass two | |

Without **both** `GITHUB_TOKEN` and `TRIPLANE_REPO`, the config falls back to the fs store,
whose path does not exist in a serverless function — `/govern` will error. That fallback is
correct locally and impossible in production, so set both or expect the review queue to be
the one broken page.

## Pass two — peers

`TRIPLANE_PEERS` names the *other* deployments, so it cannot be known until they exist.
After all four are live, set on each project and redeploy:

```
TRIPLANE_PEERS=Meridian Knowledge=https://…,Triplane=https://…,Northwind Controls=https://…,Dhruva Home Appliances=https://…
```

The switcher then lists four deployments with four distinct bundle hashes.

## Check in this order

1. **A concept page.** If `process.cwd()` + `public/graph.json` does not resolve inside a
   Vercel function, every page shows "The compiled bundle is missing" — the error state says
   exactly that, so this is diagnosable in one click. This is the single highest-risk
   assumption in the deployment.
2. `/.well-known/ai-catalog.json` — advertises the deployment's own origin, not a placeholder.
3. `/api/mcp` `tools/list` — four read tools, no write or page-scoped tool.
4. `npx tsx packages/cli/src/ard-agent.ts https://<url> "…"` — completes with no endpoint
   rewrite, which is the proof the catalog is honest about where it lives.
5. `/govern` — a real PR-backed queue rather than an error.

## Approval is the deploy, literally

CI runs on `pull_request`, so a proposal is validated — typecheck, greptest, the smoke
suite, **all four bundle builds** — before anyone can merge it. The gate cannot publish a
bundle that does not compile. Merging then triggers all four Vercel redeploys.

The flip side: a proposal against one bundle redeploys all four projects. Correct, just
noisy. Vercel's Ignored Build Step can scope it later if that matters.
