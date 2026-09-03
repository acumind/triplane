---
id: active-user
type: term
title: Active user (definition)
---
A user who performed at least one **qualifying event** in the window.
Qualifying events: `app_open`, `add_to_cart`, `purchase`, `search`.

Explicitly **not** qualifying: push-notification receipts, background syncs, and
email opens — passive signals do not make a user "active". This definition is the
single point of truth used by [[weekly-active-users]].
