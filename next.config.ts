import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingIncludes: {
    "/api/**/*": [
      "node_modules/pdfkit/js/data/**/*",
      "node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf",
    ],
  },
};

export default nextConfig;
