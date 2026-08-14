/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  allowedDevOrigins: ["127.0.0.1"],
  // Lets `frontend/Dockerfile` ship only `.next/standalone` + `.next/static`
  // instead of the full node_modules tree. No effect on `next dev`.
  output: "standalone",
};

export default nextConfig;
