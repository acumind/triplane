---
id: wau-pipeline
type: runbook
title: "Runbook: WAU pipeline"
links:
  - { to: weekly-active-users, rel: governs }
  - { to: events, rel: mentions }
---
Airflow DAG `wau_daily`, 06:00 IST.

1. Wait for the [[events]] late-arrival watermark (48h) to pass for the window edge.
2. Recompute the trailing 7-day window; restate the two provisional days.
3. Publish to `analytics.wau_daily`; alert `#growth-analytics` on >5% day-over-day swing.

**Failure modes:** watermark stall (upstream Kafka lag) → rerun with `--force-watermark`;
duplicate `event_id`s after replays → the dedupe step keys on `event_id`, verify it ran.
