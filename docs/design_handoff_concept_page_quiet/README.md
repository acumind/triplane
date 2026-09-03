# Handoff: Concept page (quiet theme) — Meridian Knowledge

## Overview
An enterprise-ready concept page for a knowledge base that humans read and agents query. Shown for one concept (`users (customer master)`, a table). Three regions: a grey navigation sidebar, a centered document column, and an "Ask" assistant panel. Adds governance signals (status, version, owner, steward, review date, classification), lineage, column-level classification, usage counts, machine endpoints, version history, and an assistant that cites concept IDs and flags coverage gaps.

## About the design files
`ConceptPageQuiet.dc.html` is a **design reference built in HTML**. It shows the intended look and behavior; it is not production code. Recreate it in your app's existing stack (React/Vue/Svelte/etc.) using your component and routing patterns. If the app has no UI framework yet, pick one that fits the rest of the codebase. Ignore the file's `<x-dc>`, `sc-for`, `sc-if`, `{{ }}` and `support.js` scaffolding; they belong to the design tool. The `<script>` at the bottom holds the sample data (columns, references) used to render the page.

## Fidelity
**High-fidelity.** Colors, type, spacing and copy are final. Match them exactly, mapping to tokens in your design system where equivalents exist.

## Layout
Full-viewport grid: `grid-template-columns: 232px 1fr 380px`, `height: 100vh`, each column scrolls independently.

### 1. Sidebar (232px, `#f7f7f7`, right border `1px #ececec`)
- Top row: brand "Meridian Knowledge" (13px/600) left, search icon button right (28×28, tooltip "Search ⌘K").
- "+ New concept" button: full width, transparent, 6px radius, 13px.
- Section label "Domain" (11px `#8a8a8a`), then domain switcher row "Meridian Analytics ▾" (6px radius).
- Concept tree, grouped by type. Group header: 11px `#8a8a8a`, name left, count right, `padding: 12px 4px 4px`. Item row: 13px, `padding: 6px 8px`, 6px radius, label ellipsized, 6px status dot at right. Selected item: `background: #e9e9e9`, weight 500. Hover: `#f0f0f0`.
- Status dot: Published = filled `#2fb344`; Draft/In review = 6px ring `1px solid #b5b5b5`, no fill.
- Footer (top border `#ececec`, 12px `#555`): green dot + "Agents connected", right-aligned "Audit · Admin" links.

Groups and items (sample): Join path (2), Metric (2), Policy (1), Runbook (1), Table (3), Term (2). See the HTML for labels.

### 2. Main column (white)
- Sticky top bar, 52px, white: breadcrumb "Meridian Analytics / Tables / users" (12px `#8a8a8a`, current item `#1a1a1a`). Right side: status text with green dot "Published · v14 · verified 12 Aug" (12px `#555`), then icon-only buttons 30×30, 6px radius, tooltips: Subscribe, Share, Export, History (14), More. Then a secondary button "Propose change" (13px/500, `1px solid #e2e2e2`, 6px radius, white).
- Content wrapper: `max-width: 760px; margin: 0 auto; padding: 36px 32px 80px`.
- Tag row: "Table", "Contains PII", "Confidential" — 11px, `padding: 3px 8px`, radius 6px, `#f3f3f3` bg, `#555` text.
- H1 "users (customer master)": 40px/700, line-height 1.1, letter-spacing -0.025em.
- Lead "One row per registered customer.": 17px `#444`.
- Meta strip: 4-column grid, top and bottom border `1px #ececec`, `padding: 14px 0`. Each cell: label 11px `#8a8a8a` over value 13px. Owner / Steward / Next review / Concept ID (ID in monospace 12px).
- H2s: 22px/600, letter-spacing -0.015em, `margin: 36px 0 12px` (first one 0 top).
- **Lineage**: 5-column grid `1fr 20px 1fr 20px 1fr`, connectors are 1px `#d6d6d6` lines. Node: `1px solid #e2e2e2`, radius 6px, `padding: 8px 10px`, 12.5px; kicker 10.5px `#8a8a8a`. Current node: `#1a1a1a` bg, white text, kicker `#aaa`. Policy node: `1px dashed #cfcfcf`. Caption under: 12px `#8a8a8a` "2 upstream · 1 policy · 3 downstream · Open full graph".
- **Schema table**: header 12px/500 `#8a8a8a`, bottom border `#ececec`; cells `padding: 9px 8px`, row border `1px #f0f0f0`; column names monospace 13px; type `#666`. Classification pill: PII = `#1a1a1a` bg/white text; Internal = `#f3f3f3`/`#555`; 11px, radius 6px.
- Callout (left rule): `border-left: 2px solid #d6d6d6; padding: 6px 16px`, 15px `#444`. Inline code: monospace 12.5px, `#f3f3f3` bg, `padding: 2px 6px`, radius 4px.
- **Referenced by**: rows `padding: 7px 0`, border `#f0f0f0`, 13.5px; relation label monospace 11.5px `#8a8a8a` in a 64px column; concept name is a link.
- **Machine view**: `<pre>` block `#f7f7f7`, radius 6px, `padding: 16px 18px`, monospace 12.5px, line-height 1.7, `#333`. Below: outline chips JSON / YAML / OpenAPI (`1px solid #e2e2e2`, radius 6px, 12px), right-aligned usage "1,284 human reads · 9,730 agent queries · 30 days" in `#8a8a8a`.
- **Recent changes**: same row pattern as references, version in the 64px monospace column; author/date in `#8a8a8a`. Link "View all 14 versions".

### 3. Ask panel (380px, white, left border `1px #ececec`)
- Header 52px: "Ask" 13px/600, "snapshot 03 Sep 08:10" 11px `#8a8a8a`, right icon buttons 28×28: Threads, How answers work, Close.
- Thread area: 13.5px, gap 18px. User message: right-aligned, max 88%, `#f3f3f3`, radius 6px, `padding: 8px 12px`.
- Answer: coverage line (green dot + "4 published concepts · high coverage", 11.5px `#8a8a8a`); body 13.5px line-height 1.65; concept citations as `<sup>` monospace 10px `#555` after the cited phrase (e.g. `trm.cohort`, `tbl.users`); inline code as above.
- Gap callout: `border-left: 2px solid #d6d6d6`, 12.5px `#555`, "Not covered: … Ask the owner".
- Action icons 28×28 with tooltips: Copy, Share thread, Flag as incorrect, Show trace.
- Composer: `1px solid #e2e2e2`, radius 6px, `padding: 10px 12px`, placeholder "Ask anything…" `#8a8a8a`; send button 28×28, `#1a1a1a` bg, white "↑", radius 6px. Footnote 11px `#8a8a8a`: "Cites published concepts only · Scope: Meridian Analytics · Logged to audit".

## Interactions & behavior
- Hover on any button/icon/tree row: background `#f0f0f0`. Links: underline `#c9c9c9`, hover underline `#1a1a1a`.
- Tooltips: dark `#1a1a1a` bg, white 11px text, `padding: 4px 8px`, radius 6px, appear below the control after ~150ms.
- Focus: visible 2px outline in `#1a1a1a`, offset 2px (keyboard only).
- ⌘K opens global search (concepts, owners, columns; filter by type, domain, classification).
- Domain switcher: dropdown of domains the user can access.
- Tree: click selects and routes to `/concepts/:id`; selected row highlighted; long labels ellipsize.
- Sticky bar actions: Subscribe (toggles notifications for this concept and its policy), Share (copy link / invite), Export (JSON, YAML, Markdown), History (opens version list with diffs), More (Report issue, Request access, Deprecate — permission-gated), Propose change (opens edit-in-review flow; direct edit only for owners).
- Lineage nodes link to their concept; "Open full graph" opens an interactive graph view.
- Classification pills and Owner/Steward are links to the policy and team pages.
- Ask panel: submit on Enter (Shift+Enter newline). While answering, show the coverage line as "Searching published concepts…". Citations link to the concept and highlight the cited passage. "Flag as incorrect" opens a short form routed to the concept owner. "Show trace" reveals which concepts were retrieved and why. Threads are saved per user and shareable.
- Empty/loading/error/no-access states are required for: tree, lineage, schema, references, ask panel. No-access shows a lock and "Request access" instead of hiding the concept.
- Responsive: below 1280px collapse the Ask panel into a toggle; below 960px the sidebar becomes a drawer.

## State
- `selectedConceptId`, `domainId`, `concept` (status, version, owner, steward, verifiedAt, nextReviewAt, classifications[], summary, columns[], lineage{upstream,downstream,policies}, references[], changes[], endpoints, usage{humanReads, agentQueries}).
- `tree` grouped by type with per-item status.
- `askThread` (messages[], coverage, citations[], gaps[]), `askSnapshotAt`, `isAnswering`.
- `permissions` (canEdit, canPublish, canViewPII), `subscription` (on/off).
- Data: concept, tree, lineage, references, usage and thread from your API; ask answers should return citations as stable concept IDs.

## Design tokens
Colors
- Ground `#ffffff`; sidebar `#f7f7f7`; subtle fill `#f3f3f3`; hover `#f0f0f0`; selected `#e9e9e9`
- Text `#1a1a1a`; body-muted `#444`; secondary `#555`; tertiary `#666`; hint `#8a8a8a`
- Borders: `#ececec` (structure), `#e2e2e2` (controls), `#f0f0f0` (table rows), `#d6d6d6` (rules, connectors), `#cfcfcf` (dashed), `#b5b5b5` (draft ring)
- Status green `#2fb344` (the only chromatic color; use only for status dots)
- Inverse: `#1a1a1a` bg with `#fff` text (current node, PII pill, send button)

Type: Instrument Sans (Google Fonts), fallback system-ui. Sizes: 40/700 h1, 22/600 h2, 17 lead, 15 callout, 14 body, 13.5 lists, 13 UI, 12.5/12 small, 11.5/11 labels, 10.5 kickers, 10 citations. Monospace: `ui-monospace, monospace`.

Spacing: 4, 6, 8, 10, 12, 14, 16, 18, 24, 32, 36, 80. Radius: 6px (controls, pills, nodes, blocks), 4px (inline code). No shadows.

## Assets
None. Icons in the mock are placeholder glyphs; use your icon set (Lucide or similar, 1.5px stroke, 16px) for search, plus, subscribe (bell), share, download, history, more, threads, info, close, copy, flag, trace, send.

## Files
- `ConceptPageQuiet.dc.html` — the design reference (layout, styles, copy, sample data).
