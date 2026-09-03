---
id: users
type: table
title: users (customer master)
concept_id: tbl.users.v14
status: Published
version: "14"
verified: 12 Aug
owner: Customer Data Platform
steward: A. Kaur
next_review: in 68 days
classifications:
  - Contains PII
  - Confidential
sources:
  - kicker: Source
    label: crm.customers (nightly)
  - kicker: Source
    label: auth.signups (stream)
columns:
  - name: id
    type: string
    classification: Internal
    notes: primary key
  - name: email
    type: string
    classification: PII
    notes: masked for analysts — see pii-handling
  - name: created_at
    type: timestamp
    classification: Internal
    notes: registration time
  - name: home_region
    type: string
    classification: Internal
    notes: ISO region code
  - name: status
    type: string
    classification: Internal
    notes: active / dormant / deleted
usage:
  humanReads: 1284
  agentQueries: 9730
  window: 30 days
changes:
  - version: v14
    summary: Added home_region
    author: A. Kaur
    at: 12 Aug
  - version: v13
    summary: PII classification on email
    author: Governance
    at: 3 Jul
---
One row per registered customer.

> Rows with `status = 'deleted'` are excluded from every metric by policy. See [[pii-handling]].
