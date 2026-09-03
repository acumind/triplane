---
id: orders
type: table
title: orders
links:
  - { to: users, rel: mentions }
---
One row per placed order.

| column | type | notes |
|---|---|---|
| order_id | string | primary key |
| user_id | string | FK → [[users]].id via [[orders-users]] |
| placed_at | timestamp | UTC |
| total_inr | numeric | order value in INR |
| channel | string | `app` / `web` / `store` |
