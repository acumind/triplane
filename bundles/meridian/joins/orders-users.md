---
id: orders-users
type: join-path
title: "Join: orders → users"
links:
  - { to: orders, rel: joins }
  - { to: users, rel: joins }
---
```sql
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE u.status != 'deleted'
```

Store-channel orders can arrive with a placeholder user; exclude `channel = 'store'`
when a metric requires an identified customer (e.g. [[churn-rate]]).
