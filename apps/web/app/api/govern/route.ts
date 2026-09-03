import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { validateProposal, type Graph } from "@triplane/engine";
import config from "../../../../../triplane.config";
import { bundleStore, rebuildsLocally } from "../../../lib/store";

/**
 * The governance gate. Every write in the system passes through here, and the only
 * thing a write can do is create a proposal — publishing needs the human POST below.
 * "Approval is the deploy": approve() lands the file, then the build reruns and all
 * three planes change together.
 */
export const dynamic = "force-dynamic";

const run = promisify(execFile);
const repoRoot = () => join(process.cwd(), "../../");
const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status });
const graph = (): Graph => JSON.parse(readFileSync(join(process.cwd(), "public/graph.json"), "utf8"));

/** The review queue, with both sides of every diff. */
export async function GET() {
  try {
    const store = bundleStore();
    const proposals = await Promise.all(
      (await store.listProposals()).map(async (p) => ({
        ...p,
        files: await Promise.all(
          (p.paths ?? []).map(async (path) => ({
            path,
            proposed: await store.readProposal(p.id, path).catch(() => ""),
            // No current version means this proposal adds a concept rather than editing one.
            current: await store.read(path).catch(() => null)
          }))
        )
      }))
    );
    return NextResponse.json({ proposals, backend: config.store.kind, rebuildsLocally });
  } catch (e: any) {
    return fail(`Could not read the review queue: ${e?.message ?? e}`, 500);
  }
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("Malformed request body.", 400);
  }

  try {
    const store = bundleStore();

    if (body.action === "propose") {
      const { path, markdown, message } = body;
      // Re-run the same lint the tool ran in the browser. That check was a courtesy;
      // this one is the gate — nothing reaches the store unvalidated.
      const check = validateProposal({ path, markdown });
      if (check.id && graph().nodes.some((n) => n.id === check.id)) {
        check.issues.push(`duplicate id: "${check.id}" already exists`);
      }
      if (check.issues.length) return NextResponse.json({ issues: check.issues }, { status: 422 });
      if (!message?.trim()) return fail("A proposal needs a one-line message.", 400);
      const proposal = await store.propose({ path: check.path, content: markdown, message });
      return NextResponse.json({ proposal });
    }

    if (body.action === "reject") {
      if (!body.id) return fail("reject needs a proposal id.", 400);
      await store.reject(String(body.id));
      return NextResponse.json({ rejected: String(body.id) });
    }

    if (body.action === "approve") {
      if (!body.id) return fail("approve needs a proposal id.", 400);
      await store.approve(String(body.id));
      if (!rebuildsLocally) {
        // GitHub backend: the merge lands the file, and the site changes only when the
        // deployment rebuilds from that commit. Whether anything triggers that rebuild is
        // a deployment fact this process cannot see, so report the merge and let the page
        // say plainly that nothing has moved yet — silence here reads as "published".
        return NextResponse.json({
          approved: String(body.id),
          rebuilt: false,
          base: config.store.kind === "github" ? config.store.base : ""
        });
      }
      const { stdout } = await run("npx", ["tsx", "packages/cli/src/build.ts", config.bundle], {
        cwd: repoRoot(),
        env: process.env
      });
      return NextResponse.json({
        approved: String(body.id),
        rebuilt: true,
        bundleHash: graph().bundleHash,
        log: stdout.trim().split("\n").slice(-3)
      });
    }

    return fail(`Unknown action: ${body.action}`, 400);
  } catch (e: any) {
    // A failed rebuild is the interesting case: the file landed but the bundle did not
    // compile, and the reviewer needs the lint output, not a stack trace.
    const detail = e?.stdout ? String(e.stdout).trim().split("\n").slice(-4).join(" · ") : (e?.message ?? String(e));
    return fail(detail, 500);
  }
}
