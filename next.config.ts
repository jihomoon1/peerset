import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't let `next dev` write AGENTS.md; CLAUDE.md holds the agent rules for this repo.
  agentRules: false,
  // Fixture mode reads tests/fixtures from disk; keep them out of deployed functions,
  // so production has no frozen data to serve even if the flag were set (M3).
  outputFileTracingExcludes: { "*": ["tests/**"] },
  // /api/peers and the workbench page read the committed peer index from disk at
  // runtime (M4a, M4b); the export reruns screening (M5).
  outputFileTracingIncludes: {
    "/api/peers": ["./data/peer-index.json"],
    "/c/[ticker]": ["./data/peer-index.json"],
    "/api/export": ["./data/peer-index.json"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
