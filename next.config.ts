import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/marketing/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["node:sqlite"],
};
export default config;
