# ARD Discovery

Give it a bare domain. It finds the site's `/.well-known/ai-catalog.json`, checks the
publisher against the host that actually served it, reads the advertised capabilities, and
connects to whatever endpoint the catalog names.

Works as a **Claude Code plugin**, a **Codex plugin**, and a plain CLI. Same code in all
three — the point of the exercise is that discovery is a protocol, not a feature of one
vendor's tool.

## Why this is not just an MCP config entry

Both hosts already speak MCP over HTTP, so pasting an endpoint into a config file is easy.
That is not discovery — it is you already knowing the endpoint. Everything here starts from
a domain name and finds the rest, including the case where it decides not to connect.

## Install

**Claude Code**

```bash
claude --plugin-dir ./plugins/triplane-ard            # development, no install
# or, from a marketplace:
/plugin marketplace add /absolute/path/to/this/repo
/plugin install triplane-ard@triplane
```

**Codex**

```bash
codex plugin marketplace add /absolute/path/to/this/repo
codex plugin add triplane-ard@triplane
```

If the plugin path gives trouble, the server works as a plain MCP entry in
`~/.codex/config.toml`:

```toml
[mcp_servers.triplane_ard]
command = "node"
args = ["/absolute/path/to/this/repo/plugins/triplane-ard/bin/ard-mcp.mjs"]
startup_timeout_sec = 30
```

**No host at all**

```bash
npm run ard -- discover example.com
npm run ard -- tools    example.com
npm run ard -- call     example.com search_concepts '{"query":"..."}'
npm run ard -- read     example.com [path]
npm run ard -- discover example.com --allow insecure-transport
```

There is deliberately no `sites` command: the CLI is one-shot, so a session registry would
always be empty. `ard_sites` exists only in the MCP server.

## Node versions

The repo targets Node 24 (`engines`), but the launcher itself only needs **Node ≥ 22.18**,
where TypeScript runs natively with no toolchain — that is what lets it work from a
copied-out plugin directory with no `node_modules`. On older Node it tries, in this order:

1. `TRIPLANE_ARD_NODE`, if set — spawn that interpreter;
2. `tsx`, resolved from this package upward (so a checkout works without `npx`);
3. otherwise it exits with one line saying which of those to set.

```bash
TRIPLANE_ARD_NODE=/path/to/node22-or-newer
```

## Tools

| Tool | What it does |
|---|---|
| `ard_discover(domain)` | Find and check a site. Always first. |
| `ard_tools(domain)` | What it offers now, and any drift from what it advertised. |
| `ard_call(domain, tool, arguments)` | Call one of those tools. |
| `ard_read(domain, path?)` | Raw source documents, via the `knowledge-bundle` capability. |
| `ard_sites()` | What this session has discovered. |

Every tool except `ard_sites` also accepts `allow` (see below), because every one of them can
reach a site through discovery and so can hit a refusal.

### The `/triplane-ard:connect` command (Claude Code only)

`/triplane-ard:connect <domain>` discovers a domain, shows the verdict, and — only with your
approval, and only if the trust check passed — writes the endpoint into the project's
`.mcp.json` so the site's own tools load natively next session, under their real names rather
than behind `ard_call`. Codex has no command surface, so there it is CLI + tools only.

## What the publisher check proves

That the catalog was served over HTTPS by the very host it names. **Exactly as strong as
HTTPS for that host, and no stronger.** It does not prove the named organisation exists or
consented, does not prove the content is accurate, and is not cryptographic — there is no
signature and no key, so a host compromise forges it trivially.

Refusals are the interesting part:

| Refusal | Why | Waiver |
|---|---|---|
| `foreign-origin` | the serving host claims to be someone else | `unverified-publisher` |
| `missing-publisher` | the catalog names no publisher domain at all | `unverified-publisher` |
| `offsite-endpoint` | **any** advertised endpoint sits on another host — that is how a catalog aims an agent at infrastructure its publisher does not control | `offsite-endpoint` |
| plain HTTP on a public host | without TLS nothing vouches for the host and the catalog is forgeable in transit | `insecure-transport` |
| `ARD_BLOCKED_TARGET` | a private or link-local address | **none, by design** |
| `ARD_TRANSPORT_UNSUPPORTED` | a transport this client cannot speak | none |

Waivers are per-call, validated against that list (an unknown one is refused, not ignored),
and **echoed back in the result** so a reader can see a site was accepted on a waiver rather
than on its merits. The private-address block has no waiver on purpose: nothing a stranger
publishes should be able to talk your agent into reaching inside your network.

## Design constraints

- **Zero runtime dependencies**, and nothing imported from the rest of this repo. A
  discovery client that shared code with the sites it discovers would be assuming its own
  answer — and the isolation is what makes standalone launch possible.
- **No tool accepts an endpoint.** Endpoints come only from a catalog that passed its
  checks. Otherwise this would be a "POST anywhere" primitive with a friendly name.
- **`ard_call` forwards only tools the site currently lists**, and returns the remote's
  errors verbatim. A proxy must never become the way around a publisher's own decision
  about what to expose.
