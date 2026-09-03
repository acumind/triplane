import { join } from "node:path";
import { fsStore, githubStore, type BundleStore } from "@triplane/engine/server";
import config from "../../../triplane.config";

/**
 * The write plane's one construction site. Server-only, and enforced rather than asked
 * for: it imports @triplane/engine/server, so importing this from a "use client"
 * component pulls node:fs into the browser bundle and the build fails. The browser
 * writes through /api/govern instead (see lib/propose.ts).
 *
 * Which backend is live is a deployment fact, not a code fact: the fs store is the demo
 * ledger, the GitHub store makes a PR the proposal and a merge the approval.
 */
export function bundleStore(): BundleStore {
  if (config.store.kind === "github") {
    return githubStore(config.store.repo, config.store.base, config.store.bundleRoot);
  }
  // Local demo path only. Reaching outside the app is exactly what the bundler warns
  // about, and it is right to: it would trace the whole project into the serverless
  // output. Deliberate here because a deployment sets GITHUB_TOKEN + TRIPLANE_REPO and
  // takes the branch above, so this line never runs in production.
  return fsStore(join(/* turbopackIgnore: true */ process.cwd(), "../../", config.bundle));
}

/** Local approval has to rerun the build itself; in prod the merge triggers CI. */
export const rebuildsLocally = config.store.kind === "fs";
