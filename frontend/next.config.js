/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for optimal Docker image size
  output: 'standalone',

  // Environment variables exposed to the client
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  },
};

module.exports = nextConfig;
