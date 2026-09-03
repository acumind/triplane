import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { BundleStore, CommitInfo, Proposal } from "../types";

/**
 * Dev/demo store: proposals land in <bundle>/.proposals/<id>/ as plain files;
 * approve() moves them into the bundle, reject() drops them. Same interface as the
 * GitHub store, proving BundleStore is a real seam, not a wrapper around git.
 * The MESSAGE sidecar holds the one-line summary and never enters the bundle.
 */
export function fsStore(bundleDir: string): BundleStore {
  const pdir = join(bundleDir, ".proposals");
  const MESSAGE = "MESSAGE";

  /** Bundle-relative paths of the concept files inside one proposal dir (`root` survives recursion). */
  const filesIn = (dir: string, root: string = dir): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) return filesIn(p, root);
      return n === MESSAGE ? [] : [relative(root, p)];
    });

  /** Prefer a readable relative path, but don't print ../../.. when the bundle sits outside cwd. */
  const label = (target: string) => {
    const rel = relative(process.cwd(), target);
    return rel && !rel.startsWith("..") ? rel : target;
  };

  return {
    async read(path) {
      return readFileSync(join(bundleDir, path), "utf8");
    },
    async list() {
      const walk = (d: string): string[] =>
        readdirSync(d).flatMap((n) => {
          const p = join(d, n);
          if (n.startsWith(".")) return [];
          return statSync(p).isDirectory() ? walk(p) : [relative(bundleDir, p)];
        });
      return walk(bundleDir);
    },
    async propose({ path, content, message }) {
      const id = `p-${Date.now().toString(36)}`;
      const target = join(pdir, id);
      mkdirSync(dirname(join(target, path)), { recursive: true });
      writeFileSync(join(target, path), content);
      writeFileSync(join(target, MESSAGE), `${message}\n→ ${path}\n`);
      return {
        id,
        diffUrl: label(target),
        message,
        paths: [path],
        createdAt: new Date().toISOString()
      } satisfies Proposal;
    },
    async listProposals() {
      if (!existsSync(pdir)) return [];
      return readdirSync(pdir)
        .filter((id) => statSync(join(pdir, id)).isDirectory())
        .map((id) => {
          const target = join(pdir, id);
          const msg = existsSync(join(target, MESSAGE)) ? readFileSync(join(target, MESSAGE), "utf8") : "";
          return {
            id,
            diffUrl: label(target),
            message: msg.split("\n")[0] || id,
            paths: filesIn(target),
            createdAt: statSync(target).mtime.toISOString()
          } satisfies Proposal;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async readProposal(id, path) {
      const target = join(pdir, id);
      if (!existsSync(target)) throw new Error(`No proposal ${id}`);
      return readFileSync(join(target, path), "utf8");
    },
    async approve(id) {
      const target = join(pdir, id);
      if (!existsSync(target)) throw new Error(`No proposal ${id}`);
      const files = filesIn(target);
      if (!files.length) throw new Error(`Proposal ${id} contains no files`);
      for (const rel of files) {
        const dest = join(bundleDir, rel);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, readFileSync(join(target, rel)));
      }
      rmSync(target, { recursive: true, force: true }); // approved = merged; the queue entry is gone
    },
    async reject(id) {
      const target = join(pdir, id);
      if (!existsSync(target)) throw new Error(`No proposal ${id}`);
      rmSync(target, { recursive: true, force: true });
    },
    async history(): Promise<CommitInfo[]> {
      return []; // fs store keeps no ledger — that's the point of the git adapter
    }
  };
}
