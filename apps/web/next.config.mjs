/** @type {import('next').NextConfig} */
export default {
  // The dev overlay badge sits over the page corner during a demo recording.
  devIndicators: false,
  transpilePackages: ["@triplane/engine"],
  // Only what the functions read at runtime. The bundle sources used to be traced from
  // ../../bundles/**, which pulled the whole project into the serverless output; build.ts
  // now copies them into public/ instead.
  outputFileTracingIncludes: { "/api/**": ["./public/graph.json", "./public/bundle/**"] },
  // Plane 3 exists to be read by OTHER origins. Without this an agent running in a browser
  // cannot perform ARD discovery against us at all — it would be blocked before it ever
  // reached the catalog it was told to fetch. These are published artifacts, not
  // credentialed endpoints: the whole point is that anyone can read them.
  async headers() {
    const cors = [
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" }
    ];
    return [
      { source: "/.well-known/:path*", headers: cors },
      { source: "/llms.txt", headers: cors },
      { source: "/graph.json", headers: cors },
      { source: "/bundle/:path*", headers: cors }
    ];
  }
};
