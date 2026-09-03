# Triplane — implementation task list

Analysis date: 2026-09-03. Derived from a read-only inspection of the repo at commit `77355a6` ("init: scaffold & shell"). Companion to `CLAUDE.md` (tasks T1–T7), `triplane-spec.md` (§3 demo beats), and `triplane-architecture.md`.

## Context

Triplane is a hackathon publishing engine: one OKF markdown bundle compiles to a human website, in-page WebMCP tools, and ARD discovery endpoints. CLAUDE.md defines tasks T1–T7 and claims the engine/CLI are verified while `apps/web` has never run. This document re-verifies that claim against the actual source, folds in the defects that would block each task, and orders the work so the six demo beats in `triplane-spec.md` §3 can be rehearsed.

### Verified state (nothing was run)

- Engine (`packages/engine`) and CLI (`packages/cli`) are complete: 8 tools all implemented, MCP handler, WebMCP adapter, fs + GitHub stores, catalog/llms.txt. `greptest` word list is clean. Only model id anywhere is `claude-sonnet-4-6`.
- Build artifacts already exist in `apps/web/public/` (graph.json 12 nodes/37 edges, ai-catalog.json, llms.txt) — `build:meridian` has been run.
- **CLAUDE.md is stale on one point:** web deps *are* installed (hoisted to root `node_modules`: next 15.5.25, react 19.2.8, marked 14.1.4, react-force-graph-2d 1.29.1). The app has simply never been started. No `.next/`, no `apps/web/node_modules`. Version currency was audited separately — see A0.
- All `@triplane/engine` imports in `apps/web` match `packages/engine/src/index.ts` exports; all cross-app relative imports of `triplane.config` resolve. `params` is correctly awaited as a Promise for Next 15.
- **Nothing constructs a `BundleStore`** anywhere in `apps/` — the entire write plane (`propose_concept` → `/govern` → approve) is inert. `/govern` is a 13-line placeholder with no nav link and no `/api/govern` route.
- Environment at analysis time: `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `TRIPLANE_REPO`, `NEXT_PUBLIC_WEBMCP_OT_TOKEN` all unset; no `.env*`; no git remote; `vercel` CLI missing; `gh` 2.95 present.

### Defects found that block specific tasks (all verified in source)

| # | Defect | Where | Blocks |
|---|--------|-------|--------|
| ~~D1~~ **FIXED** | Engine imports used `.js` specifiers on `.ts` files, which no bundler resolves by default. Fixed at the source by dropping the extensions across `packages/engine/src` (A0.4), rather than with a webpack-only `extensionAlias`. | `packages/engine/src/**` | T1 |
| ~~D12~~ **FIXED** | **The actual T1 blocker.** The engine barrel re-exported `compileBundle` and `fsStore`, so every `"use client"` component importing `@triplane/engine` dragged `node:fs` into the browser bundle. `next build` failed under **both** Turbopack and webpack — a pre-existing scaffold defect, not a Next 16 regression. Fixed by splitting the barrel into a client-safe root and a `@triplane/engine/server` subpath (A0.8). | `packages/engine/src/{index,server}.ts` | T1 |
| D16 | **FIXED** — The browser's WebMCP is a *native* implementation: `executeTool()` accepts only the `RegisteredTool` handle that `registerTool()` returns, and it ships **no enumerator** (`getTools`/`listTools`/`tools` are all absent). The adapter discarded those handles after wiring up `unregister`, so execution had nothing valid to pass and the tool inventory came back empty. Handles are now kept, keyed by name; they serve as both the execute target and the page inventory. | `adapters/webmcp.ts` | T2, T6 |
| D15 | **FIXED** — `executePageTool` passed a tool *name* to `executeTool`. Now tries the handle, the enumerated descriptor and the name in turn, reports a typed `PageToolUnavailable`, and never retries an abort as a shape mismatch. The sidebar falls back to the identical local handler, so a convention mismatch degrades to working rather than to a dead end. | `adapters/webmcp.ts`, `Sidebar.tsx` | T2, T6 |
| D14 | **FIXED** — `listPageTools()` assumed the browser registry spells its schema field `inputSchema`. In a browser that actually exposes `modelContext` it does not, so `input_schema` reached the model API undefined and every sidebar question failed with `tools.0.custom.input_schema: Input does not match the expected shape`. Only reproducible in a real WebMCP browser, which is why neither the headless A3 run nor `next build` caught it. | `adapters/webmcp.ts`, `Sidebar.tsx` | T2, T6 |
| ~~D2~~ **FIXED** (A3.1) — `lib/page.ts` now owns `pageTypeFor()`; both the registrar and the sidebar call it, and the sidebar prefers `listPageTools()` when WebMCP is present. <br> Sidebar offers `compare_metrics` on every page (filters `kind` only, ignores `scope`); under real WebMCP that tool isn't registered off metric pages → "unknown tool" | `apps/web/components/Sidebar.tsx:48-50` | T2, T6 |
| ~~D3~~ **FIXED** (A3.2) — `/api/agent` returns `{ error: string }` on every failure path. <br> Sidebar renders `[object Object]` for real Anthropic API errors (`res.error` is an object, not a string) | `Sidebar.tsx:60`, `app/api/agent/route.ts:22` | T2 |
| ~~D4~~ **FIXED** (A2.1) — `walk()` skips dot-directories. <br> `compileBundle` walks `.proposals/` → after the first `fsStore.propose()`, the next build ingests the proposal file → duplicate-id lint error → build fails | `packages/engine/src/compile.ts:82-87` | T4 |
| ~~D5~~ **FIXED** (A2.2) — `approve()` filters the MESSAGE sidecar and clears the queue entry, `reject()` deletes the dir, `listProposals()` added to the seam and both stores. <br> `fsStore.approve()` copies the `MESSAGE` sidecar into the bundle root; `reject()` is an empty stub; no way to enumerate proposals (`BundleStore` has no `listProposals`) | `packages/engine/src/stores/fs.ts:33-49`, `types.ts:88-95` | T4 |
| ~~D6~~ **FIXED** (A2.3) — `validateProposal()` (dependency-free, client-safe) gates path and frontmatter; duplicate ids caught against the live graph. <br> `propose_concept` does no path sanitization (`../` reaches `fsStore.propose`), unlike `/api/bundle` | `packages/engine/src/tools.ts:213-233` | T4 |
| ~~D7~~ **FIXED** (A2.5) — publisher switches on `TRIPLANE_BUNDLE`, domain reads `TRIPLANE_DOMAIN`, `catalogOrigin()` accepts a scheme; the ard-agent rewrite is now an explained fallback. <br> `publisher` block is hardcoded to Meridian and not switched by `TRIPLANE_BUNDLE`; catalog origin forces `https://${publisher.domain}` with no env override → docs instance publishes Meridian identity and wrong origin; `ard-agent.ts:37` host-rewrites to paper over it | `triplane.config.ts:14-18`, `packages/engine/src/catalog.ts:9,39` | T3, T5 |
| ~~D8~~ **FIXED** (A2.4) — `mcp.ts` and `catalog.ts` filter `kind === "read" && scope === "global"`. <br> `compare_metrics` (page-scoped) leaks to `/api/mcp` and `ai-catalog.json` because both filter on `kind` only | `adapters/mcp.ts:10`, `catalog.ts:24` | T3 (correctness of the security/asymmetry story) |
| ~~D9~~ **FIXED** (A2.6) — optional `bundleRoot` on the github store config variant, set from `config.bundle`. <br> `TriplaneConfig.store` github variant has no `bundleRoot`, but `githubStore()` needs one to map bundle paths inside the repo | `types.ts:13`, `stores/github.ts:8` | T4 prod, T5 |
| ~~D10~~ **FIXED** (A5.5) — the graph reads `--paper`/`--ink`/`--ink-2`/`--rule`/`--agent` once per render pass instead of hardcoding `#b89b00` and `#ffffff`. <br> `GraphView` hardcodes lit-link color `#b89b00` and white background instead of using `--agent` / `--paper` tokens → white-label leak | `apps/web/components/GraphView.tsx:39,53` | T5 (visual), guardrail 6 |
| ~~D11~~ **FIXED** (A2.7) — neutral default question; greptest pattern widened to `weekly.active`, `wau`, `churn.rate`. <br> `ard-agent.ts` default question and doc comment contain "weekly active users" (bundle words inside `packages/`); survives greptest only because the pattern is `weekly_active` | `packages/cli/src/ard-agent.ts:8,10` | guardrail 2 |

---

## Task list (execution order)

### Phase A — local, executable with no external accounts

#### A0. Dependency and runtime currency — ✅ COMPLETED 2026-09-03

Checked against the npm registry on 2026-09-03. Installed versions were compared to `latest`, and every risky upgrade was tested rather than assumed. **All upgrades below are applied and verified.**

**Result:** running on Node 24.20.0, `next build` exits 0 under Turbopack in ~2s, all seven routes compile, and the bundle hash is unchanged at `09bbb9288056` (12 concepts, 37 edges). `typecheck`, `greptest`, `smoke.mts`, `build:meridian` and `build:docs` all pass. Serving the production build verified all three planes: the home page renders type-grouped chips, `/c/weekly-active-users` renders markdown with working wikilinks, `/api/mcp` returns the five read tools, and `/.well-known/ai-catalog.json` serves.

Adopted versions: `next` 16.3.4 · `marked` 18.0.11 · `@types/node` 24.13.3 · `@types/react-dom` 19.2.5 (added) · `typescript` held at 5.9.3 · `react`/`react-dom` 19.2.8 · `tsx` 4.23.13 · `minisearch` 7.2.0 · `gray-matter` 4.0.3.

| Package | Declared | Installed | Latest | Verdict |
|---|---|---|---|---|
| `next` | `^15.1.0` | 15.5.25 | **16.3.4** | One major behind. 15.5.25 is the maintained `backport` tag, so we are current *within* 15.x. Upgrade — see A0.3. |
| `react` / `react-dom` | `^19.0.0` | 19.2.8 | 19.2.8 | Current. |
| `@types/react` | `^19.0.0` | 19.2.18 | 19.2.18 | Current. |
| `@types/react-dom` | *(not declared)* | *(absent)* | 19.2.5 | Missing — add it. |
| `typescript` | `^5.6.0` | 5.9.3 | **7.0.2** | TS 6 never shipped stable; 7.0 is the native port. Verified clean (A0.5) but hold for now. |
| `tsx` | `^4.19.0` | 4.23.13 | 4.23.13 | Current. |
| `marked` | `^14.1.0` | 14.1.4 | **18.0.11** | Four majors behind. Verified safe (A0.2). |
| `react-force-graph-2d` | `^1.25.5` | 1.29.1 | 1.29.1 | Current. |
| `gray-matter` | `^4.0.3` | 4.0.3 | 4.0.3 | Current. |
| `minisearch` | `^7.1.0` | 7.2.0 | 7.2.0 | Current. |
| `@types/node` | `^22.20.1` | 22.20.1 | 26.4.1 | Pin to the runtime we deploy on, not to `latest` — see A0.1. |

**A0.1 — Node runtime — DONE.** Node 24.20.0 is installed via nvm and is the Active LTS. Note that nvm is sourced from `.zshrc`, so **non-interactive shells still fall through to the end-of-life system Node v20.17.0 at `/usr/local/bin/node`**; CI, scripts, and agent sessions must select Node 24 explicitly. `"engines": { "node": ">=24" }` is now declared in the root `package.json`, and `@types/node` is pinned to `^24.10.1` in both the root and `apps/web`. Set Node 24 on both Vercel projects in B2. Reference dates: Node 24 entered maintenance 2026-10-20 and is supported until 2028-04-30; Node 22 is in maintenance until 2027-04-30; Node 20 went end-of-life 2026-04-30. Vercel supports Node 24 LTS for builds and functions. `@types/node` is deliberately held at 24 rather than the registry's latest of 26, since those types describe APIs the deployed runtime will not have.

**A0.2 — `marked` 14 → 18 (safe, verified).** The repo uses exactly one call, `marked.parse()` at `apps/web/app/c/[id]/page.tsx:18`, with no custom renderer, extension, or `async` option — so the v13/v14/v15 renderer and escaping breaking changes do not apply. Rendering all 12 Meridian concept bodies through both versions produced **byte-identical HTML**, and `parse` still returns a synchronous string, so the existing `as string` cast stays valid. Straight bump.

**A0.3 — `next` 15 → 16 (recommended, with one prerequisite).** Breaking-change exposure is close to zero: the app imports only `next/server`, `next/link`, `next/navigation`, and `next/dynamic`. There is no middleware, no `next/image` usage (only the generated reference in `next-env.d.ts`), no `revalidateTag`, no parallel routes, no AMP, and no runtime config; `params` is already awaited as a Promise. Node 20.9+ and TypeScript 5.1+ are both satisfied.

The one real consequence is that **Turbopack becomes the default bundler** for `next dev` and `next build`. That is why D1 must be fixed at the source first (A0.4) rather than with `experimental.extensionAlias`, which Turbopack ignores. Two things to verify during A1, since neither is provable from the registry: that Turbopack compiles the raw-TypeScript `@triplane/engine` through `transpilePackages`, and that `outputFileTracingIncludes` still pins `bundles/**` and `public/graph.json`. If either misbehaves, `next dev --webpack` / `next build --webpack` is the documented escape hatch and costs nothing but build speed. Upgrade with `npx @next/codemod@canary upgrade latest`.

**A0.4 — Fix D1 at the source (prerequisite for A0.3).** Drop the `.js` extensions from the engine's and CLI's own relative imports (`./types.js` → `./types`, and so on across `packages/**/src`). `tsconfig.base.json` already sets `moduleResolution: "Bundler"`, under which extensionless relative imports are correct. Verified end to end: both packages typecheck, `tsx packages/cli/src/build.ts bundles/meridian` produces the **identical bundle hash `09bbb9288056`** (12 concepts, 37 edges), and `scripts/smoke.mts` passes including the write/ui exclusion assertion. This resolves under webpack, Turbopack, tsc, and tsx alike, so it is strictly better than the config workaround and unblocks Next 16.

**A0.5 — TypeScript: hold at 5.9.3 for the demo.** TypeScript 7.0.2 was run against both packages and reported **zero errors**, so the upgrade is available whenever wanted. It is not worth taking during a demo week: the only gain is compile speed on a codebase that typechecks in about a second, against a brand-new compiler that the Next and editor toolchains have less mileage on. **Applied:** the declared range is now `^5.9.3`, so a fresh install can no longer silently resolve to a 5.6 that predates what is installed. Revisit TS 7 after T7.

**A0.6 — Declared ranges were looser than reality — DONE.** `next: ^15.1.0`, `typescript: ^5.6.0`, and `@types/node: ^22.0.0` all allowed installs older than what was present, so a fresh `npm ci` on another machine could have produced a different tree. Every range is now pinned to the version actually adopted.

**A0.7 — Obsolete warning in CLAUDE.md.** T1 warns that `react-force-graph-2d` "may need `--legacy-peer-deps` with React 19". Its only peer dependency is `react: "*"`, so no such flag is needed. Remove that line from CLAUDE.md when T1 is done.

**A0.8 — Engine entry split (D12, discovered during the upgrade).** Attempting the first-ever `next build` surfaced a blocker that predated this work: `packages/engine/src/index.ts` re-exported `compileBundle` and `fsStore`, both of which import `node:fs` and `node:path`. Because `Sidebar.tsx`, `GraphView.tsx`, and `WebMCPProvider.tsx` are `"use client"` and import from that barrel, the browser bundle pulled in Node builtins. Turbopack failed with `the chunking context does not support external modules (request: node:fs)`; **webpack failed the same way** with an explicit trace (`node:fs → compile.ts → index.ts → WebMCPProvider.tsx`), which is what proves this was a scaffold defect rather than a Next 16 regression. T1 could never have passed without it.

The fix keeps one engine and one contract, and only splits the entry points:
- `packages/engine/src/index.ts` — client-safe: `types`, `tools`, `adapters/webmcp`, `adapters/mcp`, `catalog`. No `node:` imports, so it is safe from a client component.
- `packages/engine/src/server.ts` (new) — re-exports the client-safe barrel **plus** `compileBundle`, `fsStore`, and `githubStore`.
- `packages/engine/package.json` gains an `exports` map: `"."` → `src/index.ts`, `"./server"` → `src/server.ts`.

Three server-side call sites now import from `@triplane/engine/server`: `apps/web/app/api/bundle/route.ts`, `scripts/smoke.mts`, and `packages/cli/src/build.ts`. Everything else is unchanged. Note for A4: the governance console is server-side and must import its store from `@triplane/engine/server`; the browser-side `remoteStore` that POSTs to `/api/govern` stays a plain client module.

Acceptance for A0: `npm run typecheck && npm run greptest && npx tsx scripts/smoke.mts` all pass, and `npm run build:meridian` still reports hash `09bbb9288056` with 12 concepts and 37 edges.

#### A1. T1: First run of the web app — mostly cleared by A0
Goal: home page renders graph + type chips; concept pages render markdown with `[[wikilink]]` → `/c/…` links.

The build blockers (D1, D12) are fixed and the app now builds and serves. Verified by HTTP against the production build: the home page emits type-grouped concept chips, `/c/weekly-active-users` renders its markdown with working wikilinks, `/api/mcp` answers `tools/list`, and the ARD catalog serves. What remains is genuine browser work that HTTP checks cannot cover:

1. Run `npm run web` and confirm the force-directed graph actually mounts and paints — `react-force-graph-2d` is dynamically imported with `ssr: false`, so it renders nothing in a server response and was **not** exercised by the checks above.
2. Click a graph node and confirm navigation. `GraphView.tsx` supplies a custom `nodeCanvasObject` with no matching `nodePointerAreaPaint`, so hit-areas fall back to the default node radius and may not match the drawn circle.
3. Confirm the accent highlight path end to end once A3 is in place.
4. Add `not-found.tsx`; unknown concept ids currently return a bare `<h1>Not found</h1>` with a 200 status.
5. Remove the obsolete `--legacy-peer-deps` warning from CLAUDE.md T1 (see A0.7), and correct CLAUDE.md's "deps not installed" claim.

Note the two build warnings about `/api/bundle` tracing the whole project — that is B1's problem, not T1's.

#### A2. Engine hygiene pass — ✅ COMPLETED 2026-09-03

All nine items are applied and verified. `typecheck`, `greptest`, `smoke.mts`, `build:meridian` (hash `09bbb9288056`, 12 concepts / 37 edges), `build:docs` (hash `d2e60f8d5d7f`) and `next build` (7 routes) all pass. Plane 3 was exercised against a running dev server: `/api/mcp` lists exactly the four global read tools, `compare_metrics` returns `-32602 Unknown tool`, and `ard-agent.ts` completes discover → verify → connect with no host rewrite when `TRIPLANE_DOMAIN` is set.

Notes on what changed beyond the letter of the list:
- **`gray-matter` could not be used for A2.3.** It does `require('fs')` at module load, and `tools.ts` is on the client-safe barrel — importing it would have reintroduced D12 (the `node:fs`-in-the-browser build failure). The validator is a new dependency-free `packages/engine/src/proposal.ts`, exported as `validateProposal` so A4's `/api/govern` can re-run the same check server-side; a client-side gate is a courtesy, not a gate.
- **`propose_concept` also rejects duplicate ids**, checked against `ctx.graph` in the handler. That is the D4 failure mode caught one step earlier, in the agent's loop rather than at the next build.
- **A real bug surfaced and was fixed:** the first cut of `fsStore.filesIn()` lost the directory prefix when recursing, so `metrics/x.md` came back as `x.md` and `approve()` wrote to the bundle root. The new smoke assertions caught it.
- **`build:docs` published Meridian's identity.** The npm script passes the bundle dir positionally while the config switches on `TRIPLANE_BUNDLE`, so the docs catalog carried the Meridian publisher — the visible half of D7. The script now sets `TRIPLANE_BUNDLE=triplane-docs`, and `build.ts` warns when argv and config disagree. This matters for B2, where the same mismatch would ship the wrong publisher to a live origin.
- **`scripts/smoke.mts` is now an assertion suite** that exits non-zero on failure (20 checks: plane-3 exposure, proposal validation, and a full propose → list → approve/reject → rebuild round-trip on a scratch bundle in `tmpdir`, so `bundles/` is never mutated).

Original item list, for reference:
1. **D4** — `compile.ts` `walk()`: skip directories starting with `.` (covers `.proposals`).
2. **D5** — `fs.ts`: `approve()` must not copy `MESSAGE` (filter inside `move`), and should remove the proposal dir after copying; implement `reject()` (rm the dir); add `listProposals(): Promise<Proposal[]>` to `BundleStore` (types.ts) and implement in both stores (fs: readdir `.proposals`, read `MESSAGE`; github: list open PRs with `proposal/` head prefix).
3. **D6** — `tools.ts` `propose_concept`: normalize path, reject `..`/absolute, require `.md` extension, and validate the markdown has frontmatter `type` (reuse `gray-matter` already in deps) so a bad proposal fails at propose time, not at build time. Surface the lint message in the tool result (this is P1's "lint feedback surfaces in-app").
4. **D8** — `mcp.ts` and `catalog.ts`: filter `t.kind === "read" && t.scope === "global"` so page-scoped tools stay in-browser. Update `smoke.mts` assertion to cover it.
5. **D7** — `triplane.config.ts`: switch `publisher` by `TRIPLANE_BUNDLE`; read `publisher.domain` from `TRIPLANE_DOMAIN` env (fallback to current placeholder). `catalog.ts`: accept an origin that already carries a scheme so `http://localhost:3000` works locally; then drop the host-rewrite hack in `ard-agent.ts:34-37` (or keep as a fallback only).
6. **D9** — add optional `bundleRoot` to the github store config variant and pass `config.bundle` through when constructing.
7. **D11** — change `ard-agent.ts` default question to a neutral one and make the bundle-specific question live in README/CLAUDE.md; tighten `greptest.sh` word list to include `weekly.active` and `wau`.
8. Guard `ard-agent.ts:39,76` against JSON-RPC error responses (currently crashes with "Cannot read properties of undefined").
9. Re-run: `npm run typecheck && npm run greptest && npx tsx scripts/smoke.mts && npm run build:meridian && npm run build:docs`.

Files: `packages/engine/src/{compile,tools,catalog,types}.ts`, `packages/engine/src/adapters/mcp.ts`, `packages/engine/src/stores/{fs,github}.ts`, `packages/cli/src/ard-agent.ts`, `triplane.config.ts`, `scripts/{greptest.sh,smoke.mts}`.

#### A3. T2: Sidebar agent end-to-end — ✅ COMPLETED 2026-09-03

All five items done. Item 5 was run against a live server with a real key, through a headless
mirror of `Sidebar.tsx`'s loop — same `/api/agent` route, same per-page tool list, same
client-side tool execution. Since `getModelContext()` is undefined outside a browser, **this is
exactly the non-WebMCP fallback path** T2 asks to check; the real WebMCP path needs the origin
trial and belongs to B3.

Demo question from `/` ("How is weekly active users computed, end to end?"): 6 tools offered,
8 tool calls (`search_concepts` → `explain_metric` → five `get_concept` → `highlight_subgraph`),
and the answer carried 6 concept chips, every one resolving to a real node.
`highlight_subgraph` fired with the full lineage set, which is what lights the graph.

On `/c/weekly-active-users` the offered set grew to 7 with `compare_metrics`, **and the model
actually called it** — D2's fix and the dynamic-toolset beat, demonstrated rather than asserted.

Plane 3 in the same session: `ard-agent.ts` completed the full four-step ARD loop for the first
time (discover → verify → connect → answer), with no host rewrite because `TRIPLANE_DOMAIN` was
set, and only the four global read tools exposed. **It cited the same six concept ids as the
in-page agent** — the one-contract-three-planes claim, checked rather than asserted.

Beat 6 (write plane, with A4 in place): in reviewer mode the agent was offered 7 tools including
`propose_concept`, researched `churn-rate` and `cohort` first, then drafted a 1040-byte
`metrics/retention-rate.md` that landed in the review queue. `/c/retention-rate` stayed **404**
and the graph stayed at 12 concepts — drafted, not published. The draft was then rejected and the
bundle left untouched.

**Still unrun:** the browser itself — that the force-graph paints, that nodes are clickable, that
the accent highlight is visible, that chips navigate. The Chrome extension could not attach to
localhost here (`Frame with ID 0 is showing error page`). Everything behind the UI is verified;
what remains is A5's territory anyway.

- **D2 fixed.** `apps/web/lib/page.ts` is the single source of `conceptIdFromPath` / `pageTypeFor`, imported by both `WebMCPProvider` (which registers) and `Sidebar` (which offers tools to the model). Under real WebMCP the sidebar now asks `listPageTools()` for the registered set instead of guessing, and applies the write filter by cross-referencing names against the contract, since `listPageTools()` returns no `kind`. Ten new smoke assertions pin the behavior: `compare_metrics` is offered on a metric page, withheld on a table page and on `/`, `propose_concept` is never offered, and ui tools still are (the plane-2/3 asymmetry).
- **D3 fixed.** `/api/agent` funnels every failure through one `fail()` helper, so a bad key, an unreachable API, a malformed body and a crashed upstream all arrive as `{ error: string }`. Verified live against a deliberately invalid key: the route answers `{"error":"Claude API: API key is invalid."}` where it previously returned a nested object that rendered as `[object Object]`. The sidebar also tolerates a non-JSON response and still coerces an object `error` defensively.
- **Item 3 fixed.** The fallback path built its own UI bridge with `location.href`, a full page reload that discarded the conversation. Both paths now share one `UIBridge` using `router.push`.
- **Item 4 was already done** in the scaffold — the Stop button is wired to `abortRef` at `Sidebar.tsx`. Added the missing feedback: aborting now logs `stopped.` instead of silently going idle.
- **Extra (D13, found while editing): the empty-state prompt hint was hardcoded Meridian vocabulary**, so the docs deployment would have invited visitors to ask about weekly active users — a concept its bundle does not contain. `sampleQuestion(graph)` now derives the hint from the bundle (metric if one exists, else a runbook/first concept) and it is clickable to seed the input. Same white-label leak class as D10, one layer above the engine's greptest.

**Outstanding — needs the operator:**
1. `ANTHROPIC_API_KEY` on the server for the full loop: tool calls streaming in the log, the graph lighting the path in the accent color, `[concept-id]` chips navigating.
2. A browser pass. The Chrome extension could not attach to `localhost:3000` in this environment (`Frame with ID 0 is showing error page`, on both `localhost` and `127.0.0.1`, while curl and the dev-server log both showed 200) — a site-permission issue, not an app defect. The non-WebMCP fallback is the path that runs in today's Chrome anyway, since the origin trial is B3.

Original item list, for reference:

1. **D2** — `Sidebar.tsx`: derive `pageType` from `usePathname()` the same way `WebMCPProvider.tsx:25-26` does (extract that into a shared helper in `lib/`), and filter the tool list by `kind !== "write" && (scope === "global" || scope.pageType === pageType)`. When `getModelContext()` exists, prefer `listPageTools()` (engine export, currently unused) as the source of truth.
2. **D3** — `app/api/agent/route.ts`: normalize upstream errors to `{ error: string }`; Sidebar: `throw new Error(typeof res.error === "string" ? res.error : res.error?.message)`.
3. Fallback `openConcept` uses `location.href` (full reload) while the WebMCP path uses `router.push`; use `router.push` in both (pass router into `runTool` or emit a bus event).
4. Wire a Stop button to the existing `abortRef` (spec §1.2 "Cancellation"; `AbortController` already threaded through fetch and `executePageTool`).
5. Run the WAU question; verify: tool log lines stream, graph highlights in accent, answer carries `[concept-id]` chips that navigate. Then test in a non-WebMCP browser (fallback path).

Files: `apps/web/components/Sidebar.tsx`, `apps/web/components/WebMCPProvider.tsx`, `apps/web/app/api/agent/route.ts`, new `apps/web/lib/page.ts` (pageType helper).

#### A4. T4: Governance console — ✅ COMPLETED 2026-09-03

The T4 acceptance was run end to end against a live server, driving the same HTTP path the
browser's client uses: propose `metrics/retention-rate.md` → it appears in the queue with both
diff sides → Approve → the build reruns (12 → 13 concepts, hash `09bbb9288056` → `3d61af734f85`)
→ the concept is live on plane 1 (`/c/retention-rate` renders with working wikilinks, and its
chip appears on the home page) and plane 3 (`search_concepts` ranks it first for "retention",
`explain_metric` traces its full lineage, and the catalog reports the new hash and "13 governed
concepts, 40 relationships"). Plane 2 follows from the same `graph.json`. Reject was verified
too: the file never enters the bundle and the graph is untouched. The demo bundle was then
restored to 12 concepts / `09bbb9288056` — **`retention-rate` is deliberately not committed,
because adding it live is the demo beat.**

What was built:
- `lib/store.ts` — the write plane's one construction site, picking `fsStore` or `githubStore`
  off `config.store`. Server-only and *enforced*: it imports `@triplane/engine/server`, so
  importing it from a client component fails the build rather than leaking `node:fs`.
- `app/api/govern/route.ts` — `GET` returns the queue with both sides of every diff; `POST`
  takes `propose` / `approve` / `reject`. Approve lands the file and then reruns
  `packages/cli/src/build.ts` locally (in prod the merge is the deploy, so it no-ops and lets CI
  redeploy). A failed rebuild returns the build's own lint output, not a stack trace.
- `app/govern/page.tsx` — the console. Rendered markdown for both "current" and "proposed"
  (side by side when replacing, single pane when adding), Approve / Reject, and a "published"
  confirmation that **re-reads `/graph.json`** rather than trusting the route's word for it.
- `lib/propose.ts` — `remoteStore`, a browser-side `ProposalSink` that POSTs to `/api/govern`.
- `lib/reviewer.ts`, `components/ReviewerNav.tsx` — `?reviewer=1` / localStorage toggle, the
  reviewer-only `/govern` link, and a "Propose a concept" affordance in the sidebar.
- `lib/markdown.ts` — one markdown path shared by concept pages and the console, so a proposal
  is reviewed in exactly the rendering it will publish into.

Engine changes this needed:
- `ToolCtx.store` narrowed to a new `ProposalSink = Pick<BundleStore, "propose">`. The write tool
  runs in the browser, so the thing satisfying it is an HTTP client, not a store; a full
  `BundleStore` still satisfies it structurally.
- `BundleStore.readProposal(id, path)` added (both backends) so the console reads the "after"
  side through the seam instead of reaching into `.proposals/` behind it.
- `splitFrontmatter()` exported client-safe, so reviewers read prose rather than YAML.

Notes:
- **Reviewer mode gates the capability, not just the affordance.** Outside reviewer mode no store
  is injected, so `propose_concept` reports "writes are disabled" even if the tool is reached
  directly. Verified.
- **The server re-validates every proposal.** The browser's lint is a courtesy; `/api/govern`
  runs `validateProposal` again plus the duplicate-id check. Verified: path traversal and missing
  frontmatter are both refused with `422` and readable issues.
- **Pulled forward from A1 (item 4):** unknown concept ids returned `<h1>Not found</h1>` with a
  **200**, which made this task's own acceptance check unreliable. `app/not-found.tsx` added and
  `/c/[id]` now calls `notFound()` — verified 404 for an unknown id, 200 for a real one.
- `.proposals/` and `*.tsbuildinfo` added to `.gitignore`.

Original item list, for reference:

1. Store wiring: a server-side `lib/store.ts` in `apps/web` that constructs `fsStore(join(process.cwd(), "../../", config.bundle))` or `githubStore(config.store.repo, base, bundleRoot)` from `config.store`. Reuse the existing `config` import pattern from `app/api/mcp/route.ts`.
2. New route `app/api/govern/route.ts`: `GET` → `store.listProposals()` (+ proposal file contents + current file if it exists, for diff); `POST {action: "approve"|"reject", id}` → store call, then on approve spawn `npx tsx packages/cli/src/build.ts <bundle>` from repo root (local) or no-op (prod: merge triggers CI). Also `POST {action: "propose", path, markdown, message}` so the sidebar's write tool can reach the store without shipping fs code to the client.
3. `propose_concept` in the browser: the tool handler runs client-side, so `ctx.store` must be a thin client that POSTs to `/api/govern`. Build a `remoteStore` implementing `BundleStore.propose` only, injected in `Sidebar.tsx` `runTool` and `WebMCPProvider.tsx` when reviewer mode is on. Stop filtering out `kind === "write"` in the sidebar tool list when reviewer mode is on.
4. Reviewer mode toggle: `?reviewer=1` / `localStorage` flag (spec §5: "reviewer mode is a toggle", no auth). Add a "Propose" affordance in the sidebar (button that seeds the prompt "Draft a concept for …") visible only in reviewer mode. Add a nav link to `/govern` in `app/layout.tsx` topbar, reviewer-mode only.
5. `app/govern/page.tsx`: client component; list proposals (id, message, path); rendered markdown (reuse the `marked` + wikilink rewrite from `app/c/[id]/page.tsx:17` — extract to `lib/markdown.ts`); show a side-by-side "current vs proposed" (or "new file"); Approve / Reject buttons calling `/api/govern`; after approve, poll `/graph.json` until `bundleHash` changes and show "published".
6. Design guardrail 6: hairlines, serif body, no cards/shadows, accent only for agent activity (proposals authored by the agent get an accent mark).
7. Acceptance run: propose → `/govern` → approve → `build` reruns → `/c/retention-rate` renders, `search_concepts` finds it via `/api/mcp`, catalog `bundleHash` changed.

Files: `apps/web/app/govern/page.tsx`, new `apps/web/app/api/govern/route.ts`, new `apps/web/lib/{store,markdown,page}.ts`, `apps/web/components/{Sidebar,WebMCPProvider}.tsx`, `apps/web/app/layout.tsx`.

#### A5. UI quality — ✅ COMPLETED 2026-09-03 (browser confirmation pending)

All eight items applied. The graph was rebuilt around `components/ForceGraphClient.tsx`, a
thin wrapper that hands the force-graph instance out through an `onReady` callback —
`next/dynamic` does not forward refs, and link distance, charge, collision and `zoomToFit`
are only reachable on the instance.

1. **Width.** A `ResizeObserver` on the wrapper feeds an explicit `width`, so the canvas
   tracks the page and re-fits when the sidebar opens or closes. The graph is not rendered
   at all until a width is measured, avoiding a flash at the library's default.
2. **Labels.** Sized `11 / globalScale`, which is constant on screen at any zoom, instead of
   a fixed graph-space size that rendered at ~4px. Each label gets an 85%-opacity `--paper`
   backing rect so overlaps stay readable, and labels now draw at every zoom level.
3. **Forces.** charge −320 (distanceMax 500), link distance 78 / strength 0.55, plus a small
   collision force, then `zoomToFit` once the engine cools. **d3-force is not in the
   dependency tree** — the graph library bundles its own — so collision is ~n²/2 checks per
   tick (66 for this bundle) rather than a new dependency in demo week. Revisit past a few
   hundred nodes.
4. **Hit areas.** `nodePointerAreaPaint` now paints a circle matching the drawn node, so
   clicks land on the node instead of near it.
5. **D10.** All five colours come from the CSS tokens, read **once per render pass** via
   `useMemo` — `getComputedStyle` inside a draw callback runs per node per frame and forces
   a style recalculation each time.
6. **Layout.** Band down to 300px on the home page and 200px on concept pages; type
   headings use `humanizeType()` (`join-path` → "Join path") with a count. Derived, not a
   lookup table, so a bundle introducing a new type still reads correctly.
7. **`.agent-flash`** is no longer dead: it became a keyframe animation applied to each new
   tool-log line, so agent activity flashes the accent and settles — with a
   `prefers-reduced-motion` opt-out.
8. **`/api/bundle`** returns 404 for a missing file, 400 for traversal or a non-`.md` path,
   and caches the compile keyed on `graph.json`'s `bundleHash`, so the listing recompiles
   once per build instead of once per request. Verified: traversal, non-md, missing and a
   warm second call all behave.

Also fixed in passing: `linkColor`/`linkWidth` compared `l.source.id`, but a link endpoint is
a **string** before the simulation runs and an object only after — so highlighting could miss
on the first frames. Both now go through an `endId()` helper.

**Not yet confirmed in a browser.** The Chrome extension still cannot attach to localhost
here (`Frame with ID 0 is showing error page` on both hostnames), so the visual result — that
the graph fills its band, labels are legible, nodes are clickable, and the accent highlight
is visible — needs a human look.

Original item list, for reference:

First look at the rendered home page: the graph is a small tangled clump floating in a mostly empty 420px band, with overlapping labels. This is demo beat 1, so it is not cosmetic. Diagnosis from `apps/web/components/GraphView.tsx`:

1. **No `width` prop (line 36).** `ForceGraph2D` falls back to its own default width instead of tracking the container, so the canvas does not match the page. Measure the wrapper with a `ResizeObserver` and pass an explicit `width`, re-measuring when the sidebar opens or closes.
2. **Labels render at 4-5px (line 48)** and only above `scale > 1.2`, which is why they are unreadable and collide. Raise the size, and draw a `--paper` backing rect behind each label so overlaps stay legible.
3. **No force tuning.** Defaults leave the 12 nodes clumped. Set link distance and charge, add a collision force sized to the node radius, and call `zoomToFit` once after the simulation cools so the graph fills its band.
4. **`nodeCanvasObject` with no `nodePointerAreaPaint` (line 41).** Click targets fall back to the default radius and will not match the drawn circles, which breaks the click-a-node beat.
5. **D10 — hardcoded colors.** `#ffffff` (39), `#111` (45, 49), `#b89b00` and `#d9d9d9` (53) bypass the tokens, so the graph will not follow `brand.accent` when the bundle is re-branded in T5. Read the tokens once per render pass, never per node per frame.
6. **Page layout.** The 420px graph band plus a large `h1` pushes the concept chips below the fold. Consider a shorter band, and type headings that use display names rather than raw type ids (`join-path`, `term`).
7. Delete dead `.agent-flash` in `globals.css` or use it for tool-log lines.
8. `/api/bundle`: add try/catch → 404 on missing file, restrict to `.md`; cache `compileBundle` result per `bundleHash` instead of recompiling per request.

### Phase C — design handoff (added 2026-09-03, after Phase A)

The UI was rebuilt to `docs/design_handoff_concept_page_quiet/`. This supersedes A5's
visual work and the old CLAUDE.md guardrail 6.

#### C1. Concept page — ✅ DONE
Three-column shell (232px / 1fr / 380px, independent scroll, responsive collapse at 1280/960),
grey sidebar with the concept tree and status dots, sticky top bar, and the document: tags,
40px title, lead, meta strip, Lineage, Schema, callout, Referenced by, Machine view, Recent
changes. Instrument Sans via `next/font`.

Governance facts the graph does not carry (status, owner, steward, review date,
classifications, columns, sources, usage, history) come from OKF frontmatter via
`lib/concept.ts`, and **every region a bundle does not declare is omitted** — the docs bundle
declares none of it and still renders correctly. `bundles/meridian/tables/users.md` declares
them, which is what makes that page match the reference.

The Ask panel is the same agent loop; it was extracted verbatim into `components/agent-loop.ts`
first so the redesign could not quietly change behaviour. `[concept-id]` renders as a linked
superscript, coverage counts the concepts actually opened, and the model is asked to end with
"Not covered: …", which becomes the gap callout.

#### C2. Controls wired — ✅ DONE
⌘K palette (searches titles, ids, types, owners and frontmatter column names over graph.json —
no second index), New concept, domain switcher, Subscribe (localStorage), Share (clipboard with
a textarea fallback and honest failure), Export, History, More (permission-gated), Propose
change, Threads (saved per viewer), How answers work, Copy / Share thread / Flag / Show trace.
Show trace displays the calls the answer actually made, carried on the answer entry.

Verified by driving the running app over CDP, not by reading the code.

#### C3. No-access state — ✅ DONE
`lib/permissions.ts` stubs canEdit / canPublish / canViewPII on the reviewer-mode pattern:
`?reviewer=1` grants edit and publish, `?access=reader` revokes canViewPII. **canViewPII is
granted by default** — gating it on reviewer mode would lock the schema for every ordinary
reader. A concept is restricted when it carries a confidential-style classification, so a
bundle that classifies nothing restricts nothing.

Withheld access: a lock replaces the tree status dot (the concept stays listed); title, lead,
tags, owner/steward/review/ID and the whole lineage stay visible; schema and prose collapse into
one lock panel naming the owner; Request access is enabled and seeds the request; the Markdown
export is disabled. `Gated` is a display gate, **not** a security boundary — the markup still
reaches the browser, and a real deployment must withhold server-side.

#### Defects found and fixed during C1–C3
- `excerpt` is the first LINE capped at 200 chars, so the page lead printed raw `[[wikilinks]]`
  and `**bold**` and could stop mid-sentence. `splitLead()` takes the whole first paragraph.
- Canvas font was set to `var(--sans)`; canvas cannot resolve a CSS custom property, so labels
  silently fell back to the browser default.
- Node radii were in graph units while labels were screen-constant, so a scaled-up layout drew
  blobs. All geometry is screen-constant now.
- The graph camera was framing an EMPTY graph — `zoomToFit` no-ops there but still marked the
  view fitted, so the real layout was never framed. The graph now sizes its LAYOUT to the
  container and leaves the camera alone.
- `isRestricted` lived in a `"use client"` module while the concept page is a server component:
  every render threw and the schema silently vanished.
- **WebMCP "Duplicate tool name"** (7 occurrences in one session): registration happens after an
  await, so a cleanup running while `loadGraph()` was in flight unregistered nothing and the next
  pass collided. Pre-existing; would have hit the demo browser.
- The second-instance script "reused" an existing worktree, which is pinned to the commit it was
  created from — the docs instance served a five-commit-old UI, turning the white-label flip into
  a comparison of two different builds. It now checks out HEAD and re-syncs dependencies.
- `humanizeType(t) + "s"` produced "Policys" in the breadcrumb; `pluralizeType()` handles it.

#### C4. Loading, empty and error states — ✅ DONE
Every region the handoff names now has all four states, and each was **exercised** rather than
assumed — by blocking `graph.json` at the network layer, stubbing `/api/agent` with a 502, and
moving the built artifact aside.

- **Tree** — empty ("no concepts yet") and error. The layout no longer throws when the bundle is
  unreadable: a throw there takes down every route *including the error boundary's own chrome*,
  so the rail reports "No compiled bundle. Run npm run build:meridian." and the rest of the app
  still renders.
- **Route level** — `error.tsx` for the index and concept segments, recognising a missing
  `graph.json` and naming the build command, because that is what is actually wrong in a fresh
  checkout. **There is deliberately no `loading.tsx`**: a loading boundary makes the route
  stream, which commits the 200 before the page can call `notFound()`, so an unknown concept
  answered 200 with "Not in this bundle" — the exact lie the 404 was added to stop. Caught by
  the route status check, not by looking at the page. A concept renders in ~30ms from a file
  read, so the boundary bought nothing; the real loading states are client-side.
- **Graph** — loading, error with Retry, and empty. Verified degrading while the index page and
  tree around it kept rendering.
- **Lineage / Schema / Referenced by / Recent changes** — empty states instead of the section
  silently vanishing. Schema's only appears for a `table`, and only when the body does not
  already render a column table, since several concepts carry columns as markdown.
- **Ask panel** — a failed question is now its own entry naming what failed with a Try again
  button, not a grey tool line. Cancellation stays a plain "stopped."
- **Command palette** — loading, no-match and index-unavailable are distinct.
- `loadGraph()` was hardened: a non-2xx returned an HTML error page and `.json()` failed with
  "Unexpected token <". It now fails with the status and does not poison the cache, so Retry works.

#### C5. Governance console and coverage — ✅ DONE
- `/govern` now uses the same shell as every other route: sticky bar with breadcrumb, a status
  dot and queue count, the store in use, and a refresh control; the document column, the type
  scale, and hairline-separated proposals. Its loading, empty, error and reviewer-off states all
  run through the shared `Notice`.
- **30 new smoke assertions** cover `lib/concept.ts`, `isRestricted`, `statusLine`,
  `humanizeType`/`pluralizeType` and `splitLead` — the code the UI actually depends on and the
  only part that had none. The contract they pin: declared frontmatter is surfaced, and a bundle
  that declares nothing still produces a correct page. 97 checks in total.

#### C6. Still outstanding
- `/` adopts the design language but has no counterpart in the handoff to match against.
- The handoff's ⌘K filters (by type, domain, classification) are not implemented; search is
  substring matching over titles, ids, types, owners and column names.

### Phase B — needs accounts/credentials

Prerequisites: `ANTHROPIC_API_KEY` (T2/T4 full loop), a GitHub remote + `GITHUB_TOKEN` + `TRIPLANE_REPO` (T4 prod store), Vercel access (T3/T5), Chrome origin-trial registration for both origins (T6).

#### B1. T3: Plane-3 endpoints in prod shape — ◐ steps 1-2 DONE 2026-09-03, acceptance needs a deployment

**The build is now warning-free.** It previously emitted two "Dynamic filesystem access causes
tracing of the whole project" warnings, which is the failure mode that bites on Vercel: the
whole source tree, `public/` included, gets pulled into the serverless function.

1. **Done — the copy-into-`public/` strategy.** `build.ts` now copies the bundle's `.md` files
   into `apps/web/public/bundle/`, and `/api/bundle` reads only from the build output off
   `process.cwd()`. It no longer imports the engine's compiler at all: the listing comes from
   `graph.json` (which also gives callers the `bundleHash`), so there is nothing to recompile
   per request and nothing outside the app to trace. The raw markdown is additionally served
   statically at `/bundle/<path>` with `text/markdown`. Honest to "the artifact is the build".
2. **Done — the second warning was `lib/store.ts`**, not `/api/bundle`. The fs store reaches the
   source bundle at the repo root, which is correct for the local demo and never runs in
   production, where `GITHUB_TOKEN` + `TRIPLANE_REPO` select the GitHub store. The path is now
   computed inside that branch only and marked `turbopackIgnore`, with the reason stated.
   `outputFileTracingIncludes` is narrowed to `public/graph.json` and `public/bundle/**`.
3. **Outstanding:** the acceptance run — `ard-agent.ts` against a deployed origin — needs B2.

Verified locally after the change: listing, single-file fetch, traversal rejection, non-`.md`
rejection, 404 on a missing file, the static copy, and a propose → reject round-trip through
the refactored store.

#### B1 (original notes)

> Confirmed during A0: the Next 16 build emits two warnings, both from `apps/web/app/api/bundle/route.ts:9`, saying the `join(process.cwd(), "../../", config.bundle)` call causes the whole project to be traced into the serverless output. That is independent evidence for the copy-into-`public/` strategy in step 1 below.
1. Decide `/api/bundle` strategy. Recommended: have `build.ts` copy the bundle's `.md` files into `apps/web/public/bundle/` and serve statically (CLAUDE.md's own fallback; removes the `../../bundles/**` tracing dependency and is "honest to the artifact is the build"). Keep the route only for the file listing, reading the copied dir off `process.cwd()`.
2. Verify `/api/mcp` on Vercel reads `public/graph.json` via `outputFileTracingIncludes`; note page routes also `readFileSync` it (`app/page.tsx:10`, `app/c/[id]/page.tsx:12`) but `public/` is deployed anyway.
3. Acceptance: `npx tsx packages/cli/src/ard-agent.ts https://<deployed> "…"` completes discover → verify → connect → answer with the same concept ids as the sidebar.

#### B2. T5: Two instances, one engine — ✅ DONE LOCALLY 2026-09-03 (hosting deferred)

Run `npm run instance:docs`: the docs bundle comes up on :3001 beside the demo bundle on
:3000. A **git worktree**, not a copy — both instances are the same commit, same engine
source (verified with `diff -rq`), same lockfile. The only difference is `TRIPLANE_BUNDLE`.

Verified with both live:

| | :3000 | :3001 |
|---|---|---|
| brand (plane 1) | Meridian Knowledge | Triplane Docs |
| publisher | Meridian Retail (demo) | Triplane |
| bundleHash | `09bbb9288056` | `d2e60f8d5d7f` |
| advertised origin | `http://localhost:3000/api/mcp` | `http://localhost:3001/api/mcp` |
| MCP tools | the same four global read tools | the same four |
| concepts | churn-rate, weekly-active-users, … | three-planes, governance-gate, … |
| sidebar suggestion | "How is churn rate … computed?" | "Explain Getting started …" |

`ard-agent.ts` completed the full ARD loop against :3001 with **no endpoint rewrite**,
citing docs concept ids. The differing sidebar suggestion is a live check that nothing in
the shell hardcodes demo vocabulary.

**Why two working trees.** Every route reads `apps/web/public/` off `process.cwd()`
(`app/layout.tsx`, `app/page.tsx`, the three API routes, `app/c/[id]/page.tsx`) and Next's
`public/` is not configurable, so `build:meridian` and `build:docs` clobber each other in a
single checkout.

**Fixed while doing this:** `npm run web` did not set `TRIPLANE_DOMAIN`, so the primary
instance advertised the placeholder `meridian.example.com` and any ARD client had to rewrite
the endpoint it had just been told to use. It now builds with its own origin.

**Hosting deferred, not blocked.** B1 already made the build warning-free and moved the
bundle into `public/`, so a Vercel deployment needs no rework. What it would additionally
need is a GitHub remote — not for hosting (`vercel deploy` takes a directory) but because
`triplane.config.ts` selects `githubStore` only when `GITHUB_TOKEN` + `TRIPLANE_REPO` are
set. Without them a deployed site falls back to `fsStore`, whose path does not exist in a
serverless bundle on a read-only filesystem, leaving `/govern` dead in production.

#### B2 (original notes)
1. Push to GitHub; create Vercel projects A (`TRIPLANE_BUNDLE=meridian`, `TRIPLANE_DOMAIN=<A origin>`) and B (`TRIPLANE_BUNDLE=triplane-docs`, `TRIPLANE_DOMAIN=<B origin>`).
2. Root build command: `npx tsx packages/cli/src/build.ts bundles/$TRIPLANE_BUNDLE && npm run build --workspace apps/web`. Add `vercel.json` (or set in dashboard) with root dir = repo root, output = `apps/web`.
3. Set `ANTHROPIC_API_KEY` on both. Acceptance: both live, same engine, different brand/publisher/bundle.

#### B3. T6: WebMCP origin trial
1. Register both origins (Chrome 149–156), set `NEXT_PUBLIC_WEBMCP_OT_TOKEN` per project.
2. Verify with the WebMCP DevTools extension: global tools listed; `compare_metrics` only on `/c/weekly-active-users` and `/c/churn-rate`; `toolchange` fires on navigation (driven by `WebMCPProvider` re-registering on `pathname` change).
3. Screen-record the DevTools panel as backup.

#### B4. T7: Demo rehearsal
Run all six beats from spec §3 twice; record a fallback video. Note CLAUDE.md says "beats 1–5 under 3 min" while the spec budgets 3:15 for all six — target 3:00 for 1–5.

### Not scheduled (documented in spec/architecture, absent from CLAUDE.md T1–T7; cut candidates)
- In-app "Edit concept" markdown editor (spec §1.4) — P1's primary journey; large. Propose-via-sidebar covers the demo.
- History view (`BundleStore.history()` exists; last in cut order).
- ~~CI workflow~~ **DONE** — `.github/workflows/ci.yml` runs typecheck, greptest, the smoke suite, both bundle builds and the web build on Node 24. Building *both* bundles from one engine is the white-label claim, checked. It cannot run until there is a remote (B2).
- `.mcp.json` for coding-agent transport; ARD schema validation (`catalog.ts` TODO); official MCP SDK transport (`mcp.ts` TODO); Playwright pass over T2.
- ~~unit tests for `shortestPath`/`upstream`~~ **DONE** — 15 assertions on synthetic fixtures (self, adjacent, multi-hop, reverse traversal and its labelling, no path, unknown node, equal-length routes, cycles; transitive closure, direction, relationship filtering, custom relationship sets, cycle termination). `upstream` had to be exported — it was module-private and only reachable through `explain_metric`. Fixtures are synthetic on purpose: tying traversal tests to bundle content would break them whenever a concept is edited.
- ~~Spec doc corrections~~ **DONE (partly moot)** — fixed "pnpm monorepo" → npm workspaces, and the lint table which claimed orphan nodes fail the build (they warn; a new concept is an orphan until something links to it, so failing there would block the first proposal of any topic). The other two items in this list were wrong: the spec contains no "T1–T8" and no stale tool count — it says 8, which is correct.

---

## Verification (end-to-end)

After Phase A:
```bash
npm run typecheck && npm run greptest && npx tsx scripts/smoke.mts
npm run build:meridian && npm run build:docs
npm run web   # then in browser: /, /c/weekly-active-users, wikilink, node click
# with ANTHROPIC_API_KEY: ask "How is weekly active users computed, end to end?" → tool log, accent highlight, chips
# reviewer mode: propose metrics/retention-rate.md → /govern → Approve → /c/retention-rate exists
npx tsx packages/cli/src/ard-agent.ts http://localhost:3000 "How is weekly active users computed?"
curl -s localhost:3000/api/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -c compare_metrics   # expect 0 after D8
```

After Phase B: `ard-agent.ts` against both deployed origins; DevTools extension shows `compare_metrics` only on metric pages; both sites show different brand and publisher from one engine.
