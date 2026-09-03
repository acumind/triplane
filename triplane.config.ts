import type { TriplaneConfig } from "./packages/engine/src/types";

/**
 * The ENTIRE white-label surface. Swap `bundle`, rebrand, redeploy — nothing else changes.
 * Select bundle at runtime with TRIPLANE_BUNDLE (meridian | triplane-docs).
 * TRIPLANE_DOMAIN sets the deployed origin the catalog advertises; it accepts a bare host
 * ("docs.example.com") or a full origin ("http://localhost:3000") for local ARD runs.
 */
const isDocs = process.env.TRIPLANE_BUNDLE === "triplane-docs";
const bundle = isDocs ? "bundles/triplane-docs" : "bundles/meridian";

const config: TriplaneConfig = {
  bundle,
  brand: {
    name: isDocs ? "Triplane Docs" : "Meridian Knowledge",
    tagline: "Publish once. Humans read it, agents drive it, the ecosystem discovers it.",
    accent: "#FFD400" // the ONLY color in the UI — reserved for agent activity
  },
  // Identity travels with the bundle: each deployment publishes as itself, never as the other.
  publisher: isDocs
    ? {
        name: "Triplane",
        domain: process.env.TRIPLANE_DOMAIN ?? "triplane.example.com",
        contact: "hello@triplane.example.com"
      }
    : {
        name: "Meridian Retail (demo)",
        domain: process.env.TRIPLANE_DOMAIN ?? "meridian.example.com",
        contact: "knowledge@meridian.example.com"
      },
  planes: {
    webmcp: {
      enabled: true,
      // Origin-trial token is per-origin: https://developer.chrome.com/origintrials (WebMCP)
      originTrialToken: process.env.NEXT_PUBLIC_WEBMCP_OT_TOKEN
    },
    ard: { enabled: true, mcp: true }
  },
  store:
    process.env.GITHUB_TOKEN && process.env.TRIPLANE_REPO
      ? { kind: "github", repo: process.env.TRIPLANE_REPO, base: "main", bundleRoot: bundle }
      : { kind: "fs" }
};
export default config;
