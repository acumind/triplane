---
id: onboarding-user
type: guide
title: "Guide: Getting started with the Meridian Analytics knowledge graph"
links:
  - to: meridian-analytics
    rel: describes
  - to: active-user
    rel: mentions
  - to: weekly-active-users
    rel: mentions
  - to: pii-handling
    rel: mentions
  - to: events
    rel: mentions
  - to: events-users
    rel: mentions
  - to: orders
    rel: mentions
---

# Getting started with Meridian Analytics

Welcome! This guide orients you to the **Meridian Analytics** knowledge graph — the governed
source of truth for Meridian's event tables, customer tables, metrics, and policies.

---

## 1. Understand the domain

[[meridian-analytics]] is the top-level entry point. Meridian is a mid-market retailer.
Everything in this graph flows either **down** from a metric to its source tables, or **up**
from a source table to every metric built on it.

---

## 2. Key concepts to read first

| Concept | Type | Why it matters |
|---|---|---|
| [[active-user]] | term | The canonical definition of what makes a user "active" — used by all activity metrics. |
| [[weekly-active-users]] | metric | The primary engagement metric; a good worked example of how metrics are structured. |
| [[events]] | table | The raw event stream; the most upstream source in the graph. |
| [[orders]] | table | Transaction source used for commerce metrics. |
| [[events-users]] | join-path | How events are joined to user profiles — includes deleted-user exclusion logic. |

---

## 3. How to navigate

- **Start from a metric** (e.g. [[weekly-active-users]]) and follow links *downward* to see
  source tables and join paths.
- **Start from a table** (e.g. [[events]]) and follow links *upward* to see every metric
  and term built on it.
- Use the **graph view** to visually trace lineage at a glance.

---

## 4. Policies you must know before querying

[[pii-handling]] governs all access to user data:

- `users.email` and other PII columns **must never** appear in dashboards, exports, or
  agent answers.
- Metrics operate on `user_id` only.
- Users with `status = 'deleted'` are **excluded at the join layer** and must never be
  re-included downstream.

Read this policy before writing any query that touches the `users` table.

---

## 5. Next steps

1. Open [[meridian-analytics]] for the full domain overview.
2. Explore [[weekly-active-users]] end-to-end as a guided example.
3. Review [[pii-handling]] to understand your compliance obligations.
4. Use the knowledge agent to ask questions — it will cite every claim and highlight the
   relevant graph nodes for you.
