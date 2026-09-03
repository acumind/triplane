import type { TriplaneConfig } from "./packages/engine/src/types";

/**
 * The ENTIRE white-label surface. Swap `bundle`, rebrand, redeploy — nothing else changes.
 * Select bundle at runtime with TRIPLANE_BUNDLE (meridian | triplane-docs).
 * TRIPLANE_DOMAIN sets the deployed origin the catalog advertises; it accepts a bare host
 * ("docs.example.com") or a full origin ("http://localhost:3000") for local ARD runs.
 */
type BundleId = "meridian" | "triplane-docs" | "controls";
const selected = (process.env.TRIPLANE_BUNDLE ?? "meridian") as BundleId;
const isDocs = selected === "triplane-docs";
const isControls = selected === "controls";
const bundle = `bundles/${selected === "meridian" ? "meridian" : selected}`;

const config: TriplaneConfig = {
  bundle,
  brand: {
    name: isDocs ? "Triplane" : isControls ? "Northwind Controls" : "Meridian Knowledge",
    tagline: "Publish once. Humans read it, agents drive it, the ecosystem discovers it.",
    accent: "#FFD400" // legacy: the current design reserves colour for status (guardrail 6)
  },
  // Sibling deployments for the sidebar switcher. Set TRIPLANE_PEERS to
  // "Name=url,Name=url" to override. The local demo trio is the default in development
  // only — a hosted tenant advertising other tenants would be a data-boundary mistake,
  // not a convenience.
  peers: process.env.TRIPLANE_PEERS
    ? process.env.TRIPLANE_PEERS.split(",")
        .map((entry) => {
          const [name, url] = entry.split("=");
          return { name: (name ?? "").trim(), url: (url ?? "").trim() };
        })
        .filter((p) => p.name && p.url)
    : process.env.NODE_ENV === "production"
    ? []
    : [
        { name: "Meridian Knowledge", url: "http://localhost:3000" },
        { name: "Triplane", url: "http://localhost:3001" },
        { name: "Northwind Controls", url: "http://localhost:3002" }
      ],
  // The pitch belongs to Triplane's own deployment. A tenant's knowledge base advertising
  // its vendor would undo the white-label claim the tenant is there to demonstrate.
  landing: isDocs,
  // Identity travels with the bundle: each deployment publishes as itself, never as the other.
  publisher: isDocs
    ? {
        name: "Triplane",
        domain: process.env.TRIPLANE_DOMAIN ?? "triplane.example.com",
        contact: "hello@triplane.example.com"
      }
    : isControls
    ? {
        name: "Northwind Financial (demo)",
        domain: process.env.TRIPLANE_DOMAIN ?? "controls.example.com",
        contact: "assurance@northwind.example.com"
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
