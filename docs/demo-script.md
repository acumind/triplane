# Demo script

Every step below was walked end to end on 2026-09-03 against the running app. Where a step
is unverified it says so.

## Before you start

Three instances, one engine — start them in three terminals:

```bash
npm run web                                              # :3000  Meridian Knowledge (tenant)
npm run instance:docs                                    # :3001  Triplane (the pitch)
bash scripts/second-instance.sh .instances/controls 3002 controls   # :3002  Northwind Controls
bash scripts/second-instance.sh .instances/dhruva   3003 dhruva     # :3003  Dhruva (D2C commerce)
```

Four deployments is more than a demo needs. **Run all four so the switcher shows four
hashes, but only flip to one live** — `:3003` is the most legible to a non-technical
audience.

Checks worth doing five minutes before, not five seconds before:

- `apps/web/.env.local` has a working `ANTHROPIC_API_KEY` — beat 3 is dead without it.
- Open `:3000`, `:3001`, `:3002` once each so Next has compiled the routes. A cold first
  render is several seconds and it will look like a hang.
- Reviewer mode is **off** on `:3000` (visit `/?reviewer=0` if unsure). Beat 6 needs to
  start from a reader's view.
- The demo asks the agent a question that takes **~40 seconds**. Talk over it — the tool
  log streaming down the panel is the thing to narrate, not dead air.

---

## The 3-minute core

### 1 · The claim (20s) — `:3001/`
The landing page. One sentence: *"one governed markdown bundle in; a website, an in-page
tool contract, and discovery endpoints out — and this page is itself a Triplane instance."*
Point at the graph: that is the docs bundle, and it is the same graph behind every claim
below it.

### 2 · What a governed concept looks like (30s) — `:3000/c/users`
Not just a definition. Owner, steward, next review, concept id; lineage upstream and down;
column-level classification with PII marked; what references it; and **Machine view** —
the endpoints an agent uses for this same concept.

Say: *"a reader sees who stands behind this and when it was last checked. An agent sees
the same thing through the endpoints at the bottom."*

### 3 · Ask it (60s) — `:3000/` → the Ask panel
Type: **"How is weekly active users computed, end to end?"**

Narrate while it runs — tool calls stream in the panel: `search_concepts`,
`explain_metric`, several `get_concept`, then `highlight_subgraph`.

Then land three points:
- **The graph lit the path** the agent took, and it stays lit next to the answer.
- **Every claim carries a concept id** as a superscript. Click one — it navigates to that
  concept. The answer is not a summary of the web; it is this bundle, with receipts.
- **"Show trace"** lists the calls behind the answer. Not a reconstruction — the recorded
  ones.

### 4 · The same knowledge, no browser (40s) — terminal
```bash
ANTHROPIC_API_KEY=$(grep '^ANTHROPIC_API_KEY=' apps/web/.env.local | cut -d= -f2-) \
  npx tsx packages/cli/src/ard-agent.ts http://localhost:3000 \
  "How is weekly active users computed, end to end?"
```
An agent that has never seen the site: discovers `ai-catalog.json`, verifies the publisher,
connects over MCP, answers — **citing the same concept ids the sidebar cited.**

**If the audience is not technical, run this against the commerce bundle instead** — same
proof, an answer anyone can judge:
```bash
ANTHROPIC_API_KEY=... npx tsx packages/cli/src/ard-agent.ts http://localhost:3003 \
  "Is the MG-750 covered under warranty if I use it in a cloud kitchen? And which jars fit it?"
```
It finds the commercial-use exclusion in the warranty policy, the same exclusion restated on
the product page, and the fitment matrix — and notes that the extended plan does not override
it. Three concepts, one answer, every claim cited.

### 5 · What agents cannot do (20s)
```bash
curl -s localhost:3000/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```
Four read tools. The write tool and the page-scoped tool are **absent by construction** —
they never leave the browser. That asymmetry is the security story, and it is a test in CI,
not a promise.

### 6 · Approval is the deploy (45s) — the write plane
1. `:3000/?reviewer=1` — reviewer mode on.
2. Ask: **"Draft a concept for retention rate, the inverse of churn rate, and propose it at
   metrics/retention-rate.md"**
3. While it drafts, open `:3000/c/retention-rate` in a second tab → **404**. The agent
   wrote something; nothing published.
4. `:3000/govern` — the proposal, with the rendered markdown a reviewer approves.
5. **Approve & publish.** The build reruns.
6. Reload `/c/retention-rate` → live. The concept count and bundle hash on `/` changed, and
   `search_concepts` over `/api/mcp` now finds it.

*"An agent can draft. Only a person can publish. One approval moved the website, the tools
and the catalog together."*

**Reset afterwards:**
```bash
rm -f bundles/meridian/metrics/retention-rate.md && rm -rf bundles/meridian/.proposals
npm run build:meridian
```

### 7 · Any bundle, same engine (20s) — the deployment switcher
Open the **Deployment** dropdown at the top of the left rail. It probes each deployment
live and shows its own name and **bundle hash** — four deployments, four different hashes,
one engine, before you click anything. Pick **Dhruva Home Appliances**.

A D2C appliance catalogue: products with spec sheets, warranty and returns policies,
fitment matrices, claim runbooks. Identical interface, a domain with nothing in common with
the other three, its own publisher in the catalog — **the engine contains no bundle
vocabulary at all**, and `npm run greptest` fails the build if any leaks in.

Worth saying out loud: *"this bundle compiled clean against the engine before we touched a
line of it."* That is the claim, not a demo of it.

Northwind Controls (`:3002`) is there if someone asks for a regulated example, and `:3001`
is the docs for the engine — also a Triplane instance.

---

## Optional extensions

**Restricted concepts (20s)** — `:3003/c/pricing-and-availability?access=reader` is the
better subject: a commerce bundle whose *pricing* is withheld needs no explanation, and that
concept exists precisely to say live prices are not in the bundle. `:3002/c/revenue-cutoff?access=reader`
works the same way. A Confidential
control: the tree shows a lock, the title, owner and lineage stay visible, the contents are
withheld behind **Request access**. You can see that it exists and who to ask. `?access=full`
restores it.

**Bring your own bundle (30s)** — `/sandbox` on any instance. Drop in `.md` files, or hit
"Use an example". The same compiler that runs the build produces the graph, the tool
contract, and the catalog the bundle would publish. Nothing is written or deployed.

**WebMCP DevTools (20s)** — **not verified by us.** Headless Chrome has no `modelContext`,
so this beat has only been tested indirectly. In a browser that exposes it, open the WebMCP
DevTools panel, invoke `get_join_path` by hand, and show `compare_metrics` present on
`/c/weekly-active-users` and absent on `/c/users`. **Try it once before relying on it live.**

---

## If something goes wrong

| Symptom | Cause and fix |
|---|---|
| Sidebar says "ANTHROPIC_API_KEY not set" | The key is missing from `apps/web/.env.local`. It is read at startup — restart after adding it. |
| A page renders "The compiled bundle is missing" | No `public/graph.json`. Run `npm run build:meridian`. |
| `:3001` or `:3002` looks like an older build | A worktree is pinned to the commit it was made from. Re-run its `second-instance.sh` command; it checks out HEAD. |
| A deployment shows "unreachable" in the switcher | That instance is down, **or** it is serving a build older than the CORS fix. Re-run its `second-instance.sh` command. |
| The agent answers but the graph stays dark | You are on a concept page. The graph lives on `/` and `/concepts`. |
| Governance approve fails | The local store shells out to the build. Check the terminal running `:3000` for the lint error. |

**The safe fallback if the live agent fails:** beats 1, 2, 5, 6 and 7 need no model at all.
Only beats 3 and 4 call the API.
