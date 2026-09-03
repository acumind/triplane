/** @type {import('next').NextConfig} */
export default {
  // The dev overlay badge sits over the page corner during a demo recording.
  devIndicators: false,
  transpilePackages: ["@triplane/engine"],
  // Only what the functions read at runtime. The bundle sources used to be traced from
  // ../../bundles/**, which pulled the whole project into the serverless output; build.ts
  // now copies them into public/ instead.
  outputFileTracingIncludes: { "/api/**": ["./public/graph.json", "./public/bundle/**"] }
};
