#!/usr/bin/env tsx
/**
 * Plane 3 proof: a headless external agent doing the full ARD loop —
 * fetch llms.txt → catalog → connect to the MCP capability → answer a question
 * with Claude, citing the SAME concept ids the in-page agent cites.
 *
 *   ANTHROPIC_API_KEY=sk-... tsx packages/cli/src/ard-agent.ts <origin> "<question>"
 *
 * The question is bundle-specific by nature — pass one that suits the deployment
 * under test (see README / CLAUDE.md for the demo question).
 */
const [origin = "http://localhost:3000", question = "What are the core concepts here, and how do they connect?"] =
  process.argv.slice(2);

async function rpc(endpoint: string, method: string, params?: unknown, id: number | null = 1) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** A JSON-RPC error is a normal 200 response — unwrap it here or crash on `.result` later. */
function unwrap(res: any, method: string) {
  if (!res) throw new Error(`${method} → empty response`);
  if (res.error) throw new Error(`${method} → JSON-RPC ${res.error.code}: ${res.error.message}`);
  if (!res.result) throw new Error(`${method} → response carried neither result nor error`);
  return res.result;
}

async function getJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.json() as any;
}

async function main() {
  console.log(`◇ ARD loop against ${origin}\n`);

  // 1. Discover
  const catalog: any = await getJson(`${origin}/.well-known/ai-catalog.json`);
  console.log(`1. discovered "${catalog.name}" — publisher: ${catalog.publisher?.name}`);

  // 2. Verify (hackathon-grade: publisher metadata check; production: signed catalogs)
  if (!catalog.publisher?.domain) throw new Error("unverifiable publisher — refusing to connect");
  console.log(`2. verified publisher domain: ${catalog.publisher.domain}`);

  // 3. Pick a capability & connect
  const mcp = catalog.capabilities?.find((c: any) => c.kind === "mcp-server");
  if (!mcp) throw new Error("no mcp-server capability in catalog");
  // Connect where the catalog says. Fallback only: if the advertised origin is not the one
  // we discovered from, rewrite and say so — that mismatch means TRIPLANE_DOMAIN was unset at build.
  let endpoint: string = mcp.endpoint;
  if (!endpoint.startsWith(origin)) {
    endpoint = endpoint.replace(/^https?:\/\/[^/]+/, origin);
    console.log(`   ! catalog advertises ${mcp.endpoint}; using ${endpoint} (set TRIPLANE_DOMAIN at build time)`);
  }
  await rpc(endpoint, "initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "ard-agent", version: "0.1" } });
  const tools = unwrap(await rpc(endpoint, "tools/list"), "tools/list").tools;
  console.log(`3. connected over MCP — ${tools.length} tools: ${tools.map((t: any) => t.name).join(", ")}\n`);

  // 4. Agent loop with Claude
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log("(no ANTHROPIC_API_KEY — stopping after discovery+connect proof)");
    return;
  }
  const messages: any[] = [{ role: "user", content: question }];
  const claudeTools = tools.map((t: any) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

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
      const out = unwrap(await rpc(endpoint, "tools/call", { name: tu.name, arguments: tu.input }), `tools/call ${tu.name}`);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out.content });
    }
    messages.push({ role: "user", content: results });
  }
}
main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
