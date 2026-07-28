import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@autoradar/domain", "@autoradar/ui"],
};

export default nextConfig;
