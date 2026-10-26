import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["node:sqlite"],
};
export default config;
