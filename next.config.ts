import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't let `next dev` write AGENTS.md; CLAUDE.md holds the agent rules for this repo.
  agentRules: false,
  // Fixture mode reads tests/fixtures from disk; keep them out of deployed functions,
  // so production has no frozen data to serve even if the flag were set (M3).
  outputFileTracingExcludes: { "*": ["tests/**"] },
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
