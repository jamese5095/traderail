import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  distDir: process.env.TRADERAIL_BUILD_DIR || '.next',
  outputFileTracingRoot: require('node:path').join(__dirname, '..'),
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  webpack(config) {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    return config;
  }
};
export default config;
