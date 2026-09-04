#!/usr/bin/env tsx
/**
 * Plane 3 proof with no agent host at all: discover a site from its origin, check the
 * publisher, connect over MCP, and answer a question with Claude — citing the SAME concept
 * ids the in-page agent cites.
 *
 *   ANTHROPIC_API_KEY=sk-... tsx packages/cli/src/ard-agent.ts <origin> "<question>"
 *
 * Discovery itself lives in @triplane/ard, which is also what the Claude Code and Codex
 * plugin runs. One implementation, three front ends: if the checks are wrong they are
 * wrong everywhere, which is the only way this is worth calling a reference client.
 *
 * The question is bundle-specific by nature — pass one that suits the deployment under
 * test (see CLAUDE.md for the demo question).
 */
import { discover, McpHttpClient, ArdError, isPrivateHost, hostOf } from "@triplane/ard";

const [origin = "http://localhost:3000", question = "What are the core concepts here, and how do they connect?"] =
  process.argv.slice(2);

async function main() {
  console.log(`◇ ARD loop against ${origin}\n`);

  // 1-2. Discover and check. The trust verdict is printed in full rather than reduced to a
  // tick: "verified" with no statement of what it proves is the dishonest version.
  const found = await discover(origin);
  console.log(`1. discovered "${found.catalog.name}" via ${found.via} — publisher: ${found.catalog.publisher?.name}`);
  console.log(`2. trust: ${found.trust.level}`);
  console.log(`   proves: ${found.trust.proves}`);
  for (const n of found.trust.doesNotProve) console.log(`   not:    ${n}`);
  if (found.endpointRewrittenFrom) {
    console.log(`   ! catalog advertises ${found.endpointRewrittenFrom}; using the loopback origin you asked for`);
    console.log(`     (set TRIPLANE_DOMAIN at build time to make this go away)`);
  }

  // 3. Connect to the endpoint the catalog names.
  const endpoint = found.capabilities.mcp?.endpoint;
  if (!endpoint) throw new ArdError("ARD_NO_CAPABILITY", "no mcp-server capability in catalog");
  const client = new McpHttpClient(endpoint, {
    allowPrivate: isPrivateHost(hostOf(endpoint)),
    clientName: "ard-agent"
  });
  await client.initialize();
  const tools = await client.listTools();
  console.log(`3. connected over MCP — ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}\n`);

  // 4. Agent loop with Claude.
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log("(no ANTHROPIC_API_KEY — stopping after discovery+connect proof)");
    return;
  }
  const messages: any[] = [{ role: "user", content: question }];
  const claudeTools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

  for (let turn = 0; turn < 8; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system:
          "Answer using ONLY the knowledge tools. Cite every claim with concept ids in [square-brackets]. Be concise.",
        messages,
        tools: claudeTools
      })
    }).then((r) => r.json() as any);
    if (res.type === "error") throw new Error(`Anthropic API: ${res.error?.message ?? JSON.stringify(res.error)}`);

    const toolUses = (res.content ?? []).filter((c: any) => c.type === "tool_use");
    const texts = (res.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text);
    if (!toolUses.length) {
      console.log(`▸ answer:\n${texts.join("\n")}`);
      return;
    }
    messages.push({ role: "assistant", content: res.content });
    const results = [];
    for (const tu of toolUses) {
      console.log(`  ⚙ ${tu.name}(${JSON.stringify(tu.input)})`);
      const out: any = await client.callTool(tu.name, tu.input);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out.content });
    }
    messages.push({ role: "user", content: results });
  }
  console.log("(stopped after 8 turns without a final answer)");
}

main().catch((e) => {
  console.error(e instanceof ArdError ? e.toText() : `✗ ${e?.message ?? e}`);
  process.exit(1);
});
