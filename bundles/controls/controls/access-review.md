---
id: access-review
type: control
title: Quarterly access review
concept_id: ctl.access-review.v6
status: Published
version: "6"
verified: 04 Aug
owner: Controls Assurance
steward: R. Mehta
next_review: in 21 days
classifications:
  - Key control
sources:
  - kicker: System
    label: identity-provider (SCIM export)
  - kicker: System
    label: hr-system (leaver feed)
columns:
  - name: control_id
    type: string
    classification: Internal
    notes: ctl.access-review
  - name: frequency
    type: string
    classification: Internal
    notes: quarterly, within 15 days of quarter end
  - name: population
    type: string
    classification: Internal
    notes: all users with write access to ledger systems
  - name: exception_threshold
    type: number
    classification: Internal
    notes: any unremediated leaver is a deficiency
changes:
  - version: v6
    summary: Added contractor accounts to the population
    author: R. Mehta
    at: 04 Aug
  - version: v5
    summary: Tightened remediation window to 5 working days
    author: Controls Assurance
    at: 12 May
---
Every quarter, each system owner confirms that the people holding write access to ledger systems still need it.

The population is drawn from the identity provider and reconciled against the leaver feed. A leaver still holding access at the time of review is an exception, and an unremediated exception is a control deficiency — see [[operating-effectiveness]].

> Evidence is the signed reviewer attestation plus the raw export it was taken from. See [[access-review-evidence]].
