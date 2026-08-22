import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/koris-assistant',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
