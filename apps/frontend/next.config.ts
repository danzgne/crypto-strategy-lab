import path from 'node:path';

import { config as loadEnvironment } from 'dotenv';
import type { NextConfig } from 'next';

loadEnvironment({
  path: new URL('../../.env', import.meta.url),
  quiet: true,
});

const nextConfig: NextConfig = {
  agentRules: false,
  experimental: {
    useTypeScriptCli: false,
  },
  output: 'standalone',
  outputFileTracingRoot: path.resolve(import.meta.dirname, '../..'),
  reactStrictMode: true,
  transpilePackages: ['@crypto-strategy-lab/shared'],
};

export default nextConfig;
