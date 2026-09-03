---
id: weekly-active-users
type: metric
title: Weekly Active Users (WAU)
owner: growth-analytics
links:
  - { to: events, rel: source }
  - { to: events-users, rel: joins }
  - { to: active-user, rel: defines }
---
Count of distinct [[active-user]]s in a rolling 7-day window, computed from [[events]]
via [[events-users]].

```sql
SELECT COUNT(DISTINCT e.user_id) AS wau
FROM events e
JOIN users u ON u.id = e.user_id          -- join: events-users
WHERE u.status != 'deleted'
  AND e.event_name IN ('app_open','add_to_cart','purchase','search')   -- term: active-user
  AND e.occurred_at >= CURRENT_DATE - INTERVAL '7 days';
```

Reported daily at 06:00 IST by [[wau-pipeline]]. Because events arrive up to 48h late,
the last two days are provisional and restated.
