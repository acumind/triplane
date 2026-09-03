# Deploying to Vercel

Four projects on one repo, differing only by `TRIPLANE_BUNDLE`.

**All four are live** — `triplane-meridian`, `triplane-docs`, `triplane-controls` and
`triplane-dhruva`, each at `https://<project>.vercel.app`, each serving its own bundle hash.
`scripts/setup-vercel.sh` does the whole thing end to end and is safe to re-run:

```bash
bash scripts/setup-vercel.sh          # create, configure, connect the repo, deploy all four
bash scripts/setup-vercel.sh peers    # pass two: backfill TRIPLANE_PEERS, redeploy
```

It reads `VERCEL_TOKEN` and `GITHUB_PAT` from `.env.vercel` (gitignored) and the Anthropic
key from `apps/web/.env.local`. It never passes the token as `--token`: npm echoes the
command it runs, which would print it into any captured log.

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

## The Git connection is the one thing a token cannot fix

**Status: connected.** All four projects link to `acumind/triplane@main`, so a push
redeploys them and an approved proposal reaches the sites on its own. What follows is how
it broke and how to tell if it breaks again.

`vercel git connect` (and `POST /v9/projects/<name>/link`) both fail with
`repo_not_found` when Vercel's **account-level GitHub authorisation** has expired — the
API then answers `git-namespaces` with a GitHub `401 Bad credentials`. A `VERCEL_TOKEN`
cannot repair that; reconnecting is an OAuth flow in the browser:

**Vercel → Settings → Git → GitHub → Connect** (or reinstall the Vercel GitHub App on
`acumind/triplane`), then re-run `bash scripts/setup-vercel.sh`.

Why it matters more than it looks: with no Git connection every deploy is `source=cli`, so
an approved proposal merges into `main` and **nothing rebuilds**. `/govern` now says so
after an approval instead of going quiet, but the deployment is still stale until someone
pushes one by hand. Check with:

```bash
curl -s https://triplane-meridian.vercel.app/graph.json | python3 -c 'import json,sys; g=json.load(sys.stdin); print(g["bundleHash"], len(g["nodes"]), g["builtAt"])'
```

## Two project settings that are not reachable from the CLI

Both blocked the first deploys, and both are PATCHed by the script via
`/v9/projects/<name>`. If you create a project by hand, turn them off yourself:

- **`enablePreviewFeedback` / `enableProductionFeedback`.** Comments inject the Vercel
  Toolbar into the HTML, which is incompatible with immutable static uploads. The deploy
  fails outright with `IMMUTABLE_STATIC_PATCH_PREVIEW_COMMENTS` — but the CLI reports only
  "Unexpected error". The real reason is visible only in `GET /v6/deployments`.
- **`ssoProtection`.** New projects get a deployment-protection wall, so every request 302s
  to a Vercel login. Set it to `null`; a public demo cannot sit behind SSO.

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

Two details the script had to learn: `vercel project inspect` does **not** print the
production URL, so the aliases come from `GET /v9/projects/<name>` → `targets.production.alias`
(take the shortest — the longer one is the team-scoped alias). And the four redeploys run
sequentially on purpose: `vercel deploy` reads `.vercel/project.json` when it starts and the
next `vercel link` overwrites that file, so backgrounding them races the link.

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

## Verified on the live deployments

- Concept pages render with governance metadata on all four — `process.cwd()` +
  `public/graph.json` **does** resolve inside a Vercel function.
- Each catalog advertises its own origin (`https://triplane-<x>.vercel.app`), no placeholder.
- `/api/mcp` lists exactly `search_concepts, get_concept, get_join_path, explain_metric` on
  all four — no write or page-scoped tool crossed the boundary.
- `/api/govern` returns `{"backend":"github","rebuildsLocally":false}` on all four.
- The switcher lists all four peers from every deployment, hashes `864b8d1bfab2` /
  `d2e60f8d5d7f` / `300eaccc0e0e` / `733e60062106`.
- The full ARD loop completes cold against `triplane-dhruva` with no endpoint rewrite,
  citing `mg-750` and `warranty-policy`.
- An unknown concept still 404s.

## Approval is the deploy, literally

CI runs on `pull_request`, so a proposal is validated — typecheck, greptest, the smoke
suite, **all four bundle builds** — before anyone can merge it. The gate cannot publish a
bundle that does not compile. Merging then triggers all four Vercel redeploys.

The flip side: a proposal against one bundle redeploys all four projects. Correct, just
noisy. Vercel's Ignored Build Step can scope it later if that matters.
