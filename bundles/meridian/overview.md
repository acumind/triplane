---
id: meridian-analytics
type: domain
title: Meridian Analytics Domain
links:
  - { to: weekly-active-users, rel: contains }
  - { to: churn-rate, rel: contains }
  - { to: events, rel: contains }
  - { to: pii-handling, rel: contains }
---
Meridian is a mid-market retailer. This bundle is the governed source of truth for its
analytics domain: event tables, customer tables, the metrics computed from them, and the
policies that constrain their use.

Start from a metric like [[weekly-active-users]] and follow the graph down to source
tables, or start from [[events]] and walk upward to everything built on it.
