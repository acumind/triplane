import { NextResponse } from "next/server";

/**
 * Thin Claude proxy — the key stays server-side; the loop stays in the browser.
 * Every failure leaves here as `{ error: string }`: the upstream reports errors as a
 * nested object, and passing that through verbatim is what renders as "[object Object]"
 * in the sidebar instead of the reason the call failed.
 */
const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fail("ANTHROPIC_API_KEY not set on the server.", 500);

  let body: { messages?: unknown; tools?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Malformed request body.", 400);
  }

  // Catch a malformed tool list here rather than as a nested upstream 400 that names
  // an array index ("tools.0.custom.input_schema") the caller cannot map to a tool.
  const bad = (Array.isArray(body.tools) ? body.tools : []).find(
    (t: any) => !t?.name || typeof t.input_schema !== "object" || t.input_schema === null
  );
  if (bad) return fail(`Tool "${bad.name ?? "(unnamed)"}" has no valid input_schema.`, 400);

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system:
          "You are the knowledge agent for this site. Answer ONLY from the knowledge tools. " +
          "Cite every claim with concept ids in [square-brackets]. " +
          "Before answering, call highlight_subgraph with every concept id you used so the user can see your path. Be concise. " +
          // Surfaces as the coverage-gap callout in the Ask panel.
          "If part of the question is not covered by any published concept, end with a final line starting exactly 'Not covered: '.",
        messages: body.messages,
        tools: body.tools
      })
    });
  } catch (e: any) {
    return fail(`Could not reach the Claude API: ${e?.message ?? e}`, 502);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.type === "error") {
    const detail = data?.error?.message ?? data?.message ?? `HTTP ${res.status} ${res.statusText}`;
    return fail(`Claude API: ${detail}`, res.status === 200 ? 502 : res.status);
  }
  return NextResponse.json(data);
}
