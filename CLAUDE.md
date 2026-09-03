# CLAUDE.md — Triplane

Publishing engine for the agentic web: one OKF bundle in → human website + WebMCP tools + ARD discovery out. Hackathon entry; optimize for the demo beats in `docs/triplane-spec.md` (§ demo script), not for generality.

## State of the repo

Phase A is complete: the engine, CLI, web app, agent loop and governance console all run.
See `docs/triplane-tasks.md` for the full record, including every defect fixed (D1–D16).

**Verified working:**
- `npm run typecheck && npm run greptest && npx tsx scripts/smoke.mts` — 67 smoke checks covering the tool contract, MCP round-trip, plane-3 exposure, proposal linting, the write-plane round-trip, WebMCP descriptor/execute shapes, and graph traversal
- `npm run build:meridian` (12 concepts, 37 edges, hash `09bbb9288056`) and `npm run build:docs` (6 concepts) — both emit `graph.json`, `.well-known/ai-catalog.json`, `llms.txt` and `bundle/` into `apps/web/public/`
- `npm run build --workspace apps/web` — 8 routes, **zero warnings**
- The sidebar agent answers end to end and cites concept ids; `ard-agent.ts` completes the full ARD loop citing the same ids; a proposal round-trips through `/govern` and lands on all three planes

**UI:** the app implements `docs/design_handoff_concept_page_quiet/` — three-column shell
(232px / 1fr / 380px), concept page, wired controls (⌘K palette, subscribe, export,
threads, trace, flag) and the no-access state. Permissions are stubbed on query params:
`?reviewer=1` grants edit/publish, `?access=reader` revokes canViewPII.

**Not yet done:** hosting (B1 acceptance, B2 on Vercel — needs a GitHub remote), the origin
trial (B3), the demo rehearsal (B4), and the handoff's loading/error states.

## Commands

```bash
npm install                      # root + engine + cli (web deps: see T1)
npm run build:meridian           # compile demo bundle → apps/web/public
npm run build:docs               # compile self-hosting docs bundle
npm run typecheck && npm run greptest
npx tsx scripts/smoke.mts        # engine smoke test
npm run web                      # next dev (after T1)
npx tsx packages/cli/src/ard-agent.ts http://localhost:3000 "How is WAU computed?"   # needs ANTHROPIC_API_KEY
npm run instance:docs            # second instance: docs bundle on :3001, alongside :3000
```

### Seeing the UI without a browser extension

Headless Chrome screenshots the running app, which is the only way to iterate on layout
here (the Claude-in-Chrome extension cannot attach to localhost in this environment):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --hide-scrollbars --virtual-time-budget=9000 --window-size=1600,1000 \
  --screenshot=/tmp/home.png http://localhost:3000/
```

`console.error` from the page is forwarded into the `next dev` output as `[browser] …`,
which is the practical way to debug client-side rendering. `console.log` is not forwarded.

### Running both instances (the white-label beat)

`npm run instance:docs` stands the docs bundle up on :3001 in a git worktree under
`.instances/` — same commit, same engine, same lockfile; the only difference is
`TRIPLANE_BUNDLE`. First run installs deps there (~1 min); later runs reuse it. It links
`apps/web/.env.local` from the primary checkout, so the key lives in one place.

Two instances need two working trees: every route reads `apps/web/public/` off
`process.cwd()` and Next's `public/` is not configurable, so both builds would otherwise
clobber each other.

**Zero-setup fallback if that misbehaves mid-demo:** `npm run build:docs` and reload — the
running server serves the other bundle in about two seconds. `npm run build:meridian`
flips it back. Less impressive than two URLs, more robust.

## Environment

Two sets of variables, loaded two different ways — this is the part that isn't guessable:

- **Web app** → `apps/web/.env.local` (copy `apps/web/.env.example`). Next loads env files from the directory it runs in, so a **root `.env` is silently ignored** by the app. `ANTHROPIC_API_KEY` lives here; it stays server-side, which is why `/api/agent` exists.
- **CLI and build** → exported in the shell or prefixed on the command (copy `.env.example`). `tsx` auto-loads nothing: `TRIPLANE_BUNDLE`, `TRIPLANE_DOMAIN`, `GITHUB_TOKEN`, `TRIPLANE_REPO`. `TRIPLANE_BUNDLE` selects bundle *and* publisher identity together — `build.ts` warns if the bundle argument disagrees with it.

Restart `npm run web` after editing `.env.local`; it is read at startup, not on hot reload.

## Architecture in one breath

`bundles/*` (OKF markdown) → `packages/engine/compile.ts` → `graph.json` → consumed by three planes: Next pages + `GraphView` (humans), `adapters/webmcp.ts` registered by `components/WebMCPProvider.tsx` (in-page agents), and `.well-known/ai-catalog.json` + `llms.txt` + `app/api/mcp` (ecosystem agents via ARD). Writes go only through `propose_concept` → `BundleStore.propose()` → human approval in `/govern`. Full spec: `docs/triplane-spec.md`. Personas/journeys: `docs/triplane-personas.md`.

## Guardrails — do not violate

1. **WebMCP API calls live ONLY in `packages/engine/src/adapters/webmcp.ts`.** Origin-trial APIs churn; one file absorbs it. (It reaches `document`/`navigator` via `globalThis` on purpose — keeps the engine lib-agnostic. Don't "fix" that.)
2. **`npm run greptest` stays green.** No bundle words (meridian, WAU, …) anywhere in `packages/`.
3. **`highlight_subgraph` is never cut.** It's the demo. Cut order if squeezed: MCP transport → `compare_metrics` → history view.
4. **`kind: "write"` and `kind: "ui"` tools never mount on `/api/mcp`.** The asymmetry is the security story.
5. **Writes only ever create proposals.** Nothing publishes without human approval. "Approval is the deploy."
6. **Design follows `docs/design_handoff_concept_page_quiet/` — that handoff is the spec, not this line.** Quiet enterprise theme: white ground, `#f7f7f7` sidebar, near-black type, Instrument Sans throughout. Green `#2fb344` is the ONLY chromatic colour and is reserved for **status dots**. No shadows, no gradients, no all-caps. Tokens in `app/globals.css`; match the handoff's values rather than inventing new ones.
   *This replaced an earlier "ink-on-paper, serif body, accent-for-agent-activity" rule.* `brand.accent` is consequently no longer used in the UI — deployments now differ by brand name and bundle, not colour. Don't "restore" the old rule; if the accent should return, decide that deliberately.
7. Model id everywhere: `claude-sonnet-4-6`.

## Tasks

**T1–T4 — done.** The web app runs, the sidebar agent works on the real WebMCP registry
with a local-contract fallback, plane-3 endpoints serve, and the governance console
round-trips a proposal. Details and the defect log: `docs/triplane-tasks.md`.

**T5 — Two deployments, one engine.** Vercel project A: `TRIPLANE_BUNDLE=meridian`; project B: `TRIPLANE_BUNDLE=triplane-docs`. Build command (root): `npx tsx packages/cli/src/build.ts bundles/$TRIPLANE_BUNDLE && npm run build --workspace apps/web`. Set `ANTHROPIC_API_KEY` on both; update `publisher.domain` per deployment before catalog generation. Acceptance: both sites live, visibly same engine, different brand/bundle — the white-label flip for the pitch.

**T6 — WebMCP origin trial.** Register both origins at Chrome origin trials (WebMCP, Chrome 149–156); put tokens in `NEXT_PUBLIC_WEBMCP_OT_TOKEN`. Verify with the WebMCP DevTools extension: tools listed globally, `compare_metrics` appears only on `/c/weekly-active-users` and `/c/churn-rate` (the `toolchange` beat). Acceptance: screen-record the DevTools panel as backup.

**T7 — Demo rehearsal.** Run the 6 beats from `docs/triplane-spec.md` end-to-end twice; record a fallback video of the full flow. Timebox: beats 1–5 in under 3 minutes.

## Known wrinkles (already handled — context for future edits)

- `tsx` CJS/ESM interop on the root config import: `build.ts` unwraps `default` defensively. Keep that pattern if you import `triplane.config.ts` from new CLI entrypoints.
- Engine typechecks with `lib: ES2022` only (no DOM) — that's why the WebMCP adapter goes through `globalThis`.
- `scripts/smoke.mts` must live inside the workspace (package resolution).
