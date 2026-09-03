---
id: events
type: table
title: events (raw event stream)
links:
  - { to: users, rel: mentions }
---
Append-only clickstream and app-event table. One row per user action.

| column | type | notes |
|---|---|---|
| event_id | string | unique |
| user_id | string | FK → [[users]].id via [[events-users]] |
| event_name | string | e.g. `app_open`, `add_to_cart`, `purchase` |
| occurred_at | timestamp | UTC |
| session_id | string | 30-min inactivity window |

Volume ≈ 40M rows/day. Late-arriving events land up to 48h behind `occurred_at`;
downstream aggregates must re-window (see [[wau-pipeline]]).
