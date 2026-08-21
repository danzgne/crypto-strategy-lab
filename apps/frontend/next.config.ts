import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    useTypeScriptCli: false,
  },
  output: 'standalone',
  outputFileTracingRoot: path.resolve(import.meta.dirname, '../..'),
  reactStrictMode: true,
  transpilePackages: ['@crypto-strategy-lab/shared'],
};

export default nextConfig;
