import type { NextConfig } from "next";

const nextConfig: any = {
  // 'standalone' builds a self-contained server for Electron packaging
  output: "standalone",
  // Prevents Next.js from trying to bundle Electron's native modules
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
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
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
