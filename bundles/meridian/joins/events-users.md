---
id: events-users
type: join-path
title: "Join: events → users"
links:
  - { to: events, rel: joins }
  - { to: users, rel: joins }
---
Canonical join for attributing events to customers:

```sql
FROM events e
JOIN users u ON u.id = e.user_id
WHERE u.status != 'deleted'
```

Always apply the `deleted` filter here, not downstream — see [[pii-handling]].
Anonymous (pre-login) events have `user_id IS NULL` and drop out of this join by design.
