---
id: pricing-and-availability
type: policy
title: "Pricing, Offers & Availability — source of truth"
concept_id: pol.pricing-and-availability.v3
status: In review
version: "3"
owner: Revenue Ops
steward: K. Bhatt
next_review: in 5 days
classifications:
  - Commercially sensitive
  - Confidential
---
**This knowledge base intentionally carries no live prices, stock levels, offers, or
order status.** Those are transactional facts served by Dhruva's commerce APIs
(storefront and ONDC/Beckn endpoints listed in the machine catalog), change by the
hour, and must never be quoted from knowledge.

What agents **may** state from this bundle: MRP framing (all MRPs are inclusive of
18% GST), that selling price can never exceed MRP, that COD and zone surcharges
follow [[shipping-serviceability]], and that invoice value — not MRP — is the basis
for any refund or the 40%-of-MRP jar program in [[warranty-policy]] (MRP prevailing
on the claim date, as published on the product page).

What agents **must do** for live questions: fetch price/stock from the commerce
capability, or hand the user to the product page. If the commerce endpoint is
unreachable, say so — do not estimate, and do not quote cached or remembered prices.
Festival-period offers exist only when a signed offer document is published to this
bundle; absence of such a concept means "no current offer" is the correct answer.
