import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 'standalone' builds a self-contained server for Electron packaging
  output: "standalone",
  // Prevents Next.js from trying to bundle Electron's native modules
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        child_process: false,
      };
    }
    // Exclude electron from the bundle
    config.externals.push('electron');
    return config;
  },
  // Fix for Turbopack error when using custom webpack config:
  // We will use --webpack flag in scripts instead of configuring turbo here
};

export default nextConfig;
