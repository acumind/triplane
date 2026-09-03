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
        ...init?.headers
      }
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
  const full = (p: string) => (bundleRoot ? `${bundleRoot}/${p}` : p);

  return {
    async read(path) {
      const d = await api(`/repos/${repo}/contents/${full(path)}?ref=${base}`);
      return Buffer.from(d.content, "base64").toString("utf8");
    },
    async list() {
      const d = await api(`/repos/${repo}/git/trees/${base}?recursive=1`);
      return d.tree.filter((t: any) => t.type === "blob" && t.path.endsWith(".md")).map((t: any) => t.path);
    },
    async propose({ path, content, message }) {
      const branch = `proposal/${Date.now().toString(36)}`;
      const ref = await api(`/repos/${repo}/git/ref/heads/${base}`);
      await api(`/repos/${repo}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha })
      });
      await api(`/repos/${repo}/contents/${full(path)}`, {
        method: "PUT",
        body: JSON.stringify({ message, branch, content: Buffer.from(content).toString("base64") })
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
      return Promise.all(
        ours.map(async (pr: any) => {
          // Files are a second call per PR; the review queue is short by design.
          const files = await api(`/repos/${repo}/pulls/${pr.number}/files?per_page=100`).catch(() => []);
          return {
            id: String(pr.number),
            diffUrl: pr.html_url,
            message: pr.title,
            paths: files.map((f: any) => (bundleRoot ? f.filename.replace(`${bundleRoot}/`, "") : f.filename)),
            createdAt: pr.created_at
          } satisfies Proposal;
        })
      );
    },
    async readProposal(id, path) {
      const pr = await api(`/repos/${repo}/pulls/${id}`);
      const d = await api(`/repos/${repo}/contents/${full(path)}?ref=${pr.head.ref}`);
      return Buffer.from(d.content, "base64").toString("utf8");
    },
    async approve(id) {
      await api(`/repos/${repo}/pulls/${id}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "squash" }) });
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
