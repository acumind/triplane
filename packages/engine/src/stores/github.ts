import type { BundleStore, CommitInfo, Proposal } from "../types";

/**
 * Production store: PR = proposal, merge = approval, git log = audit trail.
 * Authors never see any of this — they see Draft / In review / Published.
 * Uses the REST API directly (no octokit dep) — needs GITHUB_TOKEN with repo scope.
 */
export function githubStore(repo: string, base = "main", bundleRoot = ""): BundleStore {
  const token = process.env.GITHUB_TOKEN;
  const api = async (path: string, init?: RequestInit): Promise<any> => {
    const res = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "triplane-governance-gate",
        ...init?.headers
      }
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
  const full = (p: string) => (bundleRoot ? `${bundleRoot}/${p}` : p);
  /** Strip the bundle root by ANCHOR — String.replace would cut a first match anywhere. */
  const rel = (p: string) => (bundleRoot && p.startsWith(`${bundleRoot}/`) ? p.slice(bundleRoot.length + 1) : p);
  const inBundle = (p: string) => !bundleRoot || p.startsWith(`${bundleRoot}/`);
  /** Existing blob sha, or undefined when the file is new. 404 here is an answer. */
  const shaOf = async (path: string): Promise<string | undefined> => {
    try {
      const d = await api(`/repos/${repo}/contents/${full(path)}?ref=${base}`);
      return d?.sha;
    } catch {
      return undefined;
    }
  };

  return {
    async read(path) {
      const d = await api(`/repos/${repo}/contents/${full(path)}?ref=${base}`);
      return Buffer.from(d.content, "base64").toString("utf8");
    },
    async list() {
      // Scoped to THIS bundle and returned bundle-relative, because that is the contract
      // fsStore.list() implements. Unscoped, a repo holding four bundles reported every
      // markdown file in it — including the README and the other three bundles.
      const d = await api(`/repos/${repo}/git/trees/${base}?recursive=1`);
      return d.tree
        .filter((t: any) => t.type === "blob" && t.path.endsWith(".md") && inBundle(t.path))
        .map((t: any) => rel(t.path));
    },
    async propose({ path, content, message }) {
      const branch = `proposal/${Date.now().toString(36)}`;
      const ref = await api(`/repos/${repo}/git/ref/heads/${base}`);
      await api(`/repos/${repo}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha })
      });
      // Updating an existing file requires its current sha; creating one must omit it.
      // Without this, every "Propose change" to a published concept failed with a 422 while
      // proposing a brand-new concept worked — the failure mode nobody would hit in testing.
      const sha = await shaOf(path);
      await api(`/repos/${repo}/contents/${full(path)}`, {
        method: "PUT",
        body: JSON.stringify({
          message,
          branch,
          content: Buffer.from(content).toString("base64"),
          ...(sha ? { sha } : {})
        })
      });
      const pr = await api(`/repos/${repo}/pulls`, {
        method: "POST",
        body: JSON.stringify({ title: message, head: branch, base, body: "Proposed via Triplane governance gate." })
      });
      return {
        id: String(pr.number),
        diffUrl: pr.html_url,
        message,
        paths: [path],
        createdAt: pr.created_at ?? new Date().toISOString()
      } satisfies Proposal;
    },
    async listProposals(): Promise<Proposal[]> {
      const prs = await api(`/repos/${repo}/pulls?state=open&base=${base}&per_page=50`);
      const ours = prs.filter((pr: any) => String(pr.head?.ref ?? "").startsWith("proposal/"));
      const queue = await Promise.all(
        ours.map(async (pr: any) => {
          // Files are a second call per PR; the review queue is short by design.
          const files: any[] = await api(`/repos/${repo}/pulls/${pr.number}/files?per_page=100`).catch(() => []);
          // One repo holds every bundle, so a PR against another bundle is not this
          // deployment's business — without this each site listed all four queues.
          const mine = files.filter((f) => inBundle(f.filename));
          if (!mine.length) return null;
          return {
            id: String(pr.number),
            diffUrl: pr.html_url,
            message: pr.title,
            paths: mine.map((f) => rel(f.filename)),
            createdAt: pr.created_at
          } satisfies Proposal;
        })
      );
      return queue.filter((p): p is Proposal => p !== null);
    },
    async readProposal(id, path) {
      const pr = await api(`/repos/${repo}/pulls/${id}`);
      const d = await api(`/repos/${repo}/contents/${full(path)}?ref=${pr.head.ref}`);
      return Buffer.from(d.content, "base64").toString("utf8");
    },
    async approve(id) {
      try {
        await api(`/repos/${repo}/pulls/${id}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "squash" }) });
      } catch (e: any) {
        // 405/409 here means the branch cannot merge — a conflict, a failing check, or
        // squash merging disabled on the repo. Say which kind of problem it is.
        if (/GitHub (405|409)/.test(String(e?.message))) {
          throw new Error(`Proposal ${id} is not mergeable — it may conflict with ${base} or be blocked by a required check.`);
        }
        throw e;
      }
    },
    async reject(id) {
      await api(`/repos/${repo}/pulls/${id}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
    },
    async history(path): Promise<CommitInfo[]> {
      const q = path ? `?path=${encodeURIComponent(full(path))}&sha=${base}` : `?sha=${base}`;
      const commits = await api(`/repos/${repo}/commits${q}`);
      return commits.slice(0, 20).map((c: any) => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split("\n")[0],
        author: c.commit.author?.name ?? "unknown",
        at: c.commit.author?.date ?? ""
      }));
    }
  };
}
