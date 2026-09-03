# Triplane — Personas & User Journeys (v1)

> Triplane serves **five human personas and two machine personas**. Treating the agents as first-class users with journeys of their own is not a gimmick — it is the product's whole point. Every journey converges on the same governed graph; personas differ only in transport.

---

## P1 — Priya · Knowledge Author / Steward

**Role:** Senior data analyst, tech writer, or domain SME — owns the correctness of concepts.
**Pain today:** Knowledge lives in Confluence + tribal Slack; answers rot; she re-answers "how do we compute WAU?" every week.

**Journey:**
Notices a repeated question → opens the in-browser concept editor (or pastes a doc and asks the sidebar agent to draft it) → agent proposes an OKF concept with links wired in → she edits, submits → tracks proposal status → approved → shares the concept URL. Next week, the agent answers that question for her — citing her page.

**Aha:** "I wrote it once in a browser; every copilot now answers it with a citation to my page."
**Success metric:** Repeat-question rate ↓ · concepts authored per week.
**Never sees:** Git, YAML, merge conflicts — lint feedback surfaces in-app.

---

## P2 — Vikram · Reviewer / Governor

**Role:** Platform lead, data-governance or compliance owner — accountable for what agents are *allowed to say*.
**Pain today:** No gate between "someone wrote it" and "the bot says it"; audits are archaeology.

**Journey:**
Proposal notification → opens governance console → rendered diff plus the affected graph neighborhood → checks links and provenance → **Approve (= merge, = deploy)** or reject with comment → watches all three planes update → months later, pulls per-concept history when an auditor asks "who approved this definition, and when?"

**Aha:** "Approval *is* the deploy. Nothing an agent cites exists without my merge."
**Success metric:** Time-to-approve · 100% of agent citations resolve to approved versions.

---

## P3 — Ananya · Knowledge Consumer

**Role:** New engineer, analyst, or support rep — needs answers mid-task.
**Pain today:** Search returns five stale docs; asking seniors taxes everyone.

**Journey (two modes):**
*Browse* — lands on a concept page, follows graph edges to related nodes.
*Ask* — opens the sidebar, asks the WAU question → watches the graph light up hop-by-hop → gets the answer with provenance chips → clicks a chip to verify the source → done in 90 seconds.

**Aha:** "The answer showed its work."
**Success metric:** Time-to-answer · % of answers where provenance was opened.

---

## P4 — Rohit · Platform Engineer / Operator

**Role:** DevEx or platform engineer — installs, configures, and runs Triplane.
**Pain today:** Every team wants "AI on our docs"; he doesn't want to hand-build RAG + hosting + governance per team.

**Journey:**
Scaffold the repo → point `triplane.config.ts` at a bundle, set brand + publisher + plane toggles → CI green (lint + grep test) → deploy instances (env var per bundle) → register the WebMCP origin-trial token → wire GitHub store credentials → hand authors a URL → later, watch agent-analytics dashboards.

**Aha:** "Config plus markdown in; three planes out. I never wrote an agent."
**Success metric:** Setup-to-live < 1 day · zero engine forks.

---

## P5 — Kavya · Agent Builder (ecosystem developer)

**Role:** Builds copilots, coding agents, or shopping agents at another team or company.
**Pain today:** Scraping, hallucinated endpoints, no trustworthy machine channel into anyone's knowledge.

**Journey:**
Her agent needs org knowledge → fetches `llms.txt` → `/.well-known/ai-catalog.json` → verifies publisher metadata → picks a capability (MCP server or raw OKF bundle) → integrates in an afternoon → her agent's answers now cite concept IDs her users can open in a browser.

**Aha:** "I integrated a knowledge base without asking a human for API docs."
**Success metric:** Integration time · % of agent answers grounded with citations.

---

## M1 — The In-Page Agent *(machine persona)*

**Who:** The sidebar agent today; Gemini-in-Chrome-class built-in browser agents tomorrow.

**Journey:**
Page load → `getTools()` (+ `toolchange` on navigation) → receives user intent → `search_concepts` → `get_join_path` → `highlight_subgraph` (visibly shows its work) → answers with concept-ID citations → when asked to *write*, calls `propose_concept` — which can only create a proposal, never merge.

**Design guarantees it relies on:** boring flat schemas · read/ui/write asymmetry · `AbortSignal` honored.

---

## M2 — The External ARD Agent *(machine persona)*

**Who:** A headless copilot or CLI agent anywhere on the network.

**Journey:**
Intent → ARD registry search (or direct catalog fetch from a known domain) → verify publisher before connecting → connect over MCP or pull the raw OKF bundle → traverse the graph → answer citing the **same concept IDs as M1** → (roadmap) its unanswered queries feed content-gap analytics back to P1.

**Design guarantee it relies on:** read-only surface · approval = discoverability.

---

## Buyer note — Meera · Head of Platform / Data *(economic buyer, not a daily user)*

Sees the repeated-question cost and the agent-trust risk → pilots one team's bundle → validates the governance and audit story → expands bundles → renews on agent-analytics value. Full arc lives in the business plan.

---

## The convergence slide

| Persona | Transport into the graph |
|---|---|
| P1 Author · P2 Governor · P3 Consumer | Browser UI |
| P4 Operator | Git + CI + config |
| P5 Agent Builder · M2 External agent | ARD → MCP / raw bundle |
| M1 In-page agent | WebMCP |

**One governed graph. One write gate. Four transports. Seven journeys.**
