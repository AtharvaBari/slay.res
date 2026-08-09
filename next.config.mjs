/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native / CJS deps that must not be bundled or traced by webpack.
  experimental: {
    serverComponentsExternalPackages: [
      "better-sqlite3",
      "onnxruntime-node",
      "@xenova/transformers",
      "sharp",
    ],
  },
  webpack: (config) => {
    config.externals = config.externals || [];
    // pdf-parse ships a debug harness that reads a test file at import time;
    // better-sqlite3, onnxruntime-node, and @xenova/transformers are native
    // addons — bundling them breaks the relative path to their .node binaries.
    config.externals.push({
      "pdf-parse": "commonjs pdf-parse",
      "better-sqlite3": "commonjs better-sqlite3",
      "onnxruntime-node": "commonjs onnxruntime-node",
      "@xenova/transformers": "commonjs @xenova/transformers",
      sharp: "commonjs sharp",
    });
    return config;
  },
};

export default nextConfig;
