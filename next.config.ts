import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the app to be embedded as a standalone SPA in production
  output: "standalone",

  // Allow direct video URLs from any host for the <video> element
  // (images from external URLs used in next/image would need domains here)
  images: {
    remotePatterns: [],
  },

  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001",
  },
};

export default nextConfig;
