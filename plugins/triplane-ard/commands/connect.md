---
name: connect
description: Discover an ARD-enabled domain and offer to add its MCP server to this project natively
---

Discover the domain the user named and, if it checks out, offer to wire it up permanently.

1. Call `ard_discover` with the domain given in `$ARGUMENTS`.
2. Show the user, briefly: the publisher, the trust verdict with its `proves` line, the
   bundle version, and the tools the catalog advertises. If discovery was refused, stop and
   explain which check failed — do not offer a waiver unless the user asks.
3. Call `ard_tools` to confirm what the endpoint really offers.
4. Then say what a native connection would change: the tools would appear under their own
   names in this project rather than behind `ard_call`, and they would load at startup
   without a discovery step. Note that it requires a restart to take effect.
5. **Ask before writing anything.** On approval, add the endpoint to `./.mcp.json` in the
   current project, creating the file if absent and preserving any existing `mcpServers`
   entries:

```json
{ "mcpServers": { "<short-name>": { "url": "<endpoint from the catalog>", "transport": "http" } } }
```

Use a short kebab-case name derived from the publisher. If a server of that name already
exists, ask before replacing it.

6. Tell the user to restart Claude Code, and that `/mcp` will then list the server.

Never write a config entry for a domain whose trust check did not pass.
