---
id: pii-handling
type: policy
title: "Policy: PII handling in analytics"
links:
  - { to: users, rel: governs }
---
`users.email` and any joined PII column must never appear in dashboards, exports, or
agent answers. Metrics operate on `user_id` only. Users with `status = 'deleted'` are
excluded at the join layer (see [[events-users]]) — never re-included downstream.
Agent-facing tools expose aggregates and ids, not raw PII values.
