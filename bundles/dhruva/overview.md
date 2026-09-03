---
id: dhruva-catalog
type: domain
title: Dhruva Home Appliances — Governed Catalog
links:
  - { to: mg-750, rel: contains }
  - { to: ic-1800, rel: contains }
  - { to: ro-7, rel: contains }
  - { to: warranty-policy, rel: contains }
  - { to: returns-policy, rel: contains }
  - { to: shipping-serviceability, rel: contains }
  - { to: pricing-and-availability, rel: contains }
concept_id: dom.dhruva-catalog.v8
status: Published
version: "8"
verified: 22 Aug
owner: Catalogue Ops
steward: S. Raghavan
next_review: in 45 days
---
Dhruva is a Bengaluru-based D2C kitchen-appliance brand selling on its own storefront
and marketplaces. This bundle is the **approved source of truth** for everything an
assistant may say on Dhruva's behalf: product facts, warranty and returns rules,
serviceability, and claim procedures.

What this bundle deliberately does **not** contain: live prices, stock, offers, or
order status — see [[pricing-and-availability]] for where those live and why.

Start from a product like [[mg-750]] and follow the graph into [[warranty-policy]]
and [[warranty-claim-process]], or start from a policy and walk back to every product
it governs. Every answer an agent gives must cite the concept ids it used.
