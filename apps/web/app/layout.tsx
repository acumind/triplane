import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";
import type { Graph } from "@triplane/engine";
import config from "../../../triplane.config";
import { WebMCPProvider } from "../components/WebMCPProvider";
import { AskPanel } from "../components/AskPanel";
import { ConceptSidebar, type TreeItem } from "../components/ConceptSidebar";
import { CommandPalette } from "../components/CommandPalette";

const sans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

export const metadata = { title: config.brand.name, description: config.brand.tagline };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The tree is part of the shell, so it is built once here rather than per page.
  //
  // A throw here takes down every route including the error boundary's own chrome, so the
  // shell degrades instead: the rail reports that the bundle is missing and the rest of
  // the app still renders. An unbuilt checkout should show a instruction, not a blank page.
  let graph: Graph | null = null;
  let treeError = "";
  try {
    graph = JSON.parse(readFileSync(join(process.cwd(), "public/graph.json"), "utf8")) as Graph;
  } catch (e: any) {
    treeError = /ENOENT|no such file/i.test(String(e?.message))
      ? "No compiled bundle. Run npm run build:meridian."
      : `Bundle unreadable: ${e?.message ?? e}`;
  }

  const byType = new Map<string, TreeItem[]>();
  for (const n of [...(graph?.nodes ?? [])].sort((a, b) => a.title.localeCompare(b.title))) {
    // The domain concept is the switcher above the tree; listing it again as its own
    // group would say the same thing twice.
    if (n.type === "domain") continue;
    const fm = n.frontmatter as any;
    const status = String(fm?.status ?? "Published");
    const classifications = Array.isArray(fm?.classifications) ? fm.classifications.map(String) : [];
    byType.set(n.type, [...(byType.get(n.type) ?? []), { id: n.id, title: n.title, status, classifications }]);
  }
  const groups = [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  // The domain concept names the scope; fall back to the brand when a bundle has none.
  const domains = (graph?.nodes ?? []).filter((n) => n.type === "domain").map((n) => ({ id: n.id, title: n.title }));
  const domain = domains[0]?.title ?? config.brand.name;

  return (
    <html lang="en" className={sans.variable} style={{ ["--accent" as any]: config.brand.accent }}>
      <head>
        {config.planes.webmcp.originTrialToken && (
          <meta httpEquiv="origin-trial" content={config.planes.webmcp.originTrialToken} />
        )}
      </head>
      <body>
        <div className="shell">
          <ConceptSidebar brand={config.brand.name} domain={domain} domains={domains} groups={groups} error={treeError} />
          <main className="col-main">
            <WebMCPProvider>{children}</WebMCPProvider>
          </main>
          <AskPanel />
        </div>
        <CommandPalette />
      </body>
    </html>
  );
}
