import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the shared workspace package (ships raw TS from src).
  transpilePackages: ["@jarvis/shared"],
};

export default nextConfig;
