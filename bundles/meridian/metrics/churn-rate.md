---
id: churn-rate
type: metric
title: Churn rate (weekly, per cohort)
owner: growth-analytics
links:
  - { to: weekly-active-users, rel: depends_on }
  - { to: users, rel: source }
  - { to: cohort, rel: defines }
---
Share of a [[cohort]] active in week *n−1* but **not** active in week *n*, using the
same activity definition as [[weekly-active-users]].

`churn(w, cohort) = |active(w−1) ∖ active(w)| / |active(w−1)|`

Exclude store-only customers (see [[orders-users]]) — walk-in purchases carry no
digital-activity signal, so counting them inflates churn.
