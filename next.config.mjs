/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pg and bcryptjs use Node APIs; keep them out of the bundler.
  serverExternalPackages: ["pg"],
  outputFileTracingRoot: process.cwd(),
};
export default nextConfig;
