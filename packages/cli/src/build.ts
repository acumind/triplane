#!/usr/bin/env tsx
/**
 * `tsx packages/cli/src/build.ts <bundleDir>` — the whole pipeline:
 * OKF markdown → lint → graph.json → ai-catalog.json → llms.txt, into apps/web/public.
 * One approved change reruns this in CI; all three planes update. That IS the demo.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { compileBundle, buildTools, buildAiCatalog, buildLlmsTxt } from "@triplane/engine/server";
import { validateAiCatalog } from "@triplane/ard";
import * as cfgMod from "../../../triplane.config.js";
const config = ((cfgMod as any).default?.default ?? (cfgMod as any).default ?? cfgMod) as import("@triplane/engine").TriplaneConfig;

const bundleDir = resolve(process.argv[2] ?? config.bundle);
const outDir = resolve(process.argv[3] ?? "apps/web/public");

console.log(`▲ triplane build\n  bundle: ${bundleDir}`);
// Identity comes from the config (TRIPLANE_BUNDLE); the bundle dir comes from argv.
// If they disagree the catalog would publish the wrong publisher — say so loudly.
if (bundleDir !== resolve(config.bundle)) {
  console.log(`  △ warn: building ${bundleDir} but config resolves to ${resolve(config.bundle)}`);
  console.log(`  △ the catalog will publish as "${config.publisher.name}" — set TRIPLANE_BUNDLE to match.`);
}
const { graph, issues } = compileBundle(bundleDir);

for (const i of issues) console.log(`  ${i.level === "error" ? "✗" : "△"} [${i.level}] ${i.file}: ${i.message}`);
if (issues.some((i) => i.level === "error")) {
  console.error("✗ build failed — fix lint errors above.");
  process.exit(1);
}

mkdirSync(join(outDir, ".well-known"), { recursive: true });

// Copy the source markdown into the build output. Plane 3 promises raw OKF access, and
// serving it from the artifact means the deployed function never has to reach outside
// the app to a directory the bundler would then have to trace. The artifact IS the build.
const bundleOut = join(outDir, "bundle");
rmSync(bundleOut, { recursive: true, force: true });
for (const n of graph.nodes) {
  const dest = join(bundleOut, n.path);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(bundleDir, n.path), dest);
}

// Validate with the SAME code a stranger's discovery client runs against us. Publishing a
// catalog we would ourselves refuse to consume is the failure mode worth catching here.
const catalog = buildAiCatalog(config, graph, buildTools());
const check = validateAiCatalog(catalog);
for (const w of check.warnings) console.log(`  △ catalog: ${w}`);
if (check.errors.length) {
  for (const e of check.errors) console.error(`  ✗ catalog: ${e}`);
  console.error("✗ build failed — the ai-catalog.json this would publish is invalid.");
  process.exit(1);
}

writeFileSync(join(outDir, "graph.json"), JSON.stringify(graph));
writeFileSync(join(outDir, ".well-known", "ai-catalog.json"), JSON.stringify(catalog, null, 2));
writeFileSync(join(outDir, "llms.txt"), buildLlmsTxt(config));

console.log(`  ✓ ${graph.nodes.length} concepts, ${graph.edges.length} edges (hash ${graph.bundleHash})`);
console.log(`  ✓ wrote graph.json, .well-known/ai-catalog.json, llms.txt, bundle/ (${graph.nodes.length} files) → ${outDir}`);
