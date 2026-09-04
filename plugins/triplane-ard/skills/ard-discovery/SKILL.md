---
name: ard-discovery
description: Use when asked to discover, connect to, or answer from a website by domain name using Agentic Resource Discovery (ARD) — including any request mentioning ai-catalog.json, llms.txt, a publisher's knowledge base, or "what tools does this site offer". Explains the ard_ tools and how to report trust honestly.
---

# Agentic Resource Discovery

Some sites publish a machine-readable catalog at `/.well-known/ai-catalog.json` describing
who publishes them and what an agent may do with them. The `ard_*` tools turn a bare domain
into a working connection to such a site.

## The flow

1. **`ard_discover(domain)`** — always first. A bare domain is enough (`example.com`); a full
   URL works too. It fetches the catalog, falls back to `llms.txt` if there is none,
   validates the shape, and checks the publisher.
2. **`ard_tools(domain)`** — what the site *actually* offers right now, and any difference
   from what its catalog advertised.
3. **`ard_call(domain, tool, arguments)`** — call one of those tools.
4. **`ard_read(domain, path?)`** — read the raw source documents, when the site publishes a
   `knowledge-bundle` capability.
5. **`ard_sites()`** — what you have discovered this session.

Never guess an endpoint. There is no way to pass one, by design: discovery is what finds it.

## Reporting trust — do not round this up

`ard_discover` returns a trust verdict with a `proves` line and several `does NOT prove`
lines. Relay them honestly:

- **`verified-origin`** means the catalog was served over HTTPS by the very host it names.
  That is exactly as strong as HTTPS for that host — no more. It is **not** proof that the
  named organisation exists, consented, or is telling the truth about its content.
- **`unverified-local`** is a plain-HTTP or loopback origin. Fine for a local instance,
  worthless against a network attacker.
- **`related-origin`** matched by a naive two-label comparison, not a public-suffix list.
  Say so.
- **`foreign-origin`** and **`missing-publisher`** are refused by default.

If the result carries a **CHECKS WAIVED** line, say so in your answer. A site accepted on a
waiver is not the same as a site that passed, and the person reading you cannot see the tool
output.

There are no signatures anywhere in this scheme. If a user asks whether a publisher is
"verified", the honest answer is that DNS and TLS for that host vouch for it, and nothing
else does.

## When a check fails

A refusal is a result, not a bug. Report which check failed and why, in plain words, before
doing anything else.

`ard_discover`, `ard_tools`, `ard_call` and `ard_read` all accept an `allow` waiver
(`unverified-publisher`, `offsite-endpoint`, `insecure-transport`). **Never pass one on your
own initiative.** Explain what the waiver turns off, what the risk is, and let the user
decide.

Two refusals have **no waiver at all**, and reporting them as fixable would be wrong:

- a **private or link-local address** (`ARD_BLOCKED_TARGET`) — nothing a stranger publishes
  should talk this agent into reaching inside the user's network;
- a **transport this client cannot speak** (`ARD_TRANSPORT_UNSUPPORTED`).

An `offsite-endpoint` refusal means a catalog tried to point you at a server its own
publisher may not control — the most interesting refusal to explain out loud.

## Citing

Results usually carry stable ids. Quote them in square brackets — `[some-concept-id]` — and
end with the provenance line the tool returned, so the reader can see which origin and which
content version an answer came from. Never blend a tool result with your own background
knowledge without saying which is which.

## What you cannot do

These tools are read-only, and not because of a policy here: a publisher decides what it
exposes, and `ard_call` forwards only tools the site currently lists. If a site keeps its
write operations off its public endpoint, they are unreachable through here, and the correct
response is to say so rather than to look for another route.
