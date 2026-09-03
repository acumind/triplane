---
id: retention-rate
type: metric
title: Retention rate (weekly, per cohort)
owner: growth-analytics
links:
  - to: churn-rate
    rel: inverse_of
  - to: weekly-active-users
    rel: depends_on
  - to: users
    rel: source
  - to: cohort
    rel: defines
---

Share of a [[cohort]] active in week *n−1* that remains active in week *n*, using the
same activity definition as [[weekly-active-users]].

`retention(w, cohort) = |active(w−1) ∩ active(w)| / |active(w−1)|`

This is the **direct inverse** of [[churn-rate]]:

`retention(w, cohort) = 1 − churn(w, cohort)`

Both metrics share the same denominator — users active in the prior week — so they
always sum to exactly 1 for a given cohort and week.

## Exclusions

Exclude store-only customers (see [[orders-users]]). Walk-in purchases carry no
digital-activity signal; including them would deflate retention just as they inflate
churn.

## SQL sketch

```sql
WITH prior_week AS (
  SELECT DISTINCT user_id
  FROM events
  WHERE occurred_at >= CURRENT_DATE - INTERVAL '14 days'
    AND occurred_at <  CURRENT_DATE - INTERVAL '7 days'
),
current_week AS (
  SELECT DISTINCT user_id
  FROM events
  WHERE occurred_at >= CURRENT_DATE - INTERVAL '7 days'
    AND occurred_at <  CURRENT_DATE
)
SELECT
  COUNT(DISTINCT cw.user_id)::FLOAT / NULLIF(COUNT(DISTINCT pw.user_id), 0)
    AS retention_rate
FROM prior_week pw
LEFT JOIN current_week cw USING (user_id)
JOIN users u ON u.id = pw.user_id
WHERE u.status != 'deleted'
  AND u.acquisition_channel != 'store-only';   -- exclude walk-ins
```

## Notes

- Reported on the same daily 06:00 IST cadence as [[weekly-active-users]].
- Because [[weekly-active-users]] events arrive up to 48 h late, the most recent
  two days are provisional and will be restated.
- Cohorts are defined by `users.created_at` truncated to Monday-start week (UTC);
  see [[cohort]] for the canonical definition.
