import type { NextConfig } from "next";

// CSP is set per-request with a nonce in src/proxy.ts (Next 16 proxy).
// HSTS only in production — never preload localhost/dev hosts.
const securityHeaders = [
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // argon2 is a native module (node-gyp-build dynamic requires): keep it an
  // external server package instead of letting the bundler trace it.
  serverExternalPackages: ["argon2", "web-push"],
  // The desktop code reads the packaged app's own manifest at a path `next build` cannot
  // resolve, and the tracer then keeps the whole project. The standalone server runs the
  // compiled output alone (scripts/desktop/standalone-check.mjs), so none of this belongs in it.
  outputFileTracingExcludes: {
    "*": [
      // Whatever a build machine happens to hold next to the project (.env is not among them:
      // Next copies it into the standalone output itself, and CI has none).
      "*.html",
      "*.tsbuildinfo",
      "build/**",
      "dist-installer/**",
      "installers/**",
      "playwright-report/**",
      "screenshots/**",
      "uploads/**",
      "Dockerfile",
      "LESSONS.md",
      "README.md",
      "build-resources/**",
      "db/**",
      "docker-compose.yml",
      "docs/**",
      "e2e/**",
      "electron/**",
      "electron-builder.config.cjs",
      "eslint.config.mjs",
      "next.config.ts",
      "package-lock.json",
      "playwright.config.ts",
      "postcss.config.mjs",
      "renovate.json",
      "scripts/**",
      "services/**",
      "src/**",
      "tools/**",
      "tsconfig.json",
      "vitest.config.ts",
    ],
  },
  agentRules: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
