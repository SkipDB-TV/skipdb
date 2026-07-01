/** @type {import('next').NextConfig} */
const nextConfig = {
  // The test suite runs its own `next dev` alongside a normal one in the same
  // checkout — Next.js locks one dev server per distDir, so give the test
  // server a separate build output dir to avoid colliding with it.
  ...(process.env.SKIPDB_TEST_SERVER ? { distDir: ".next-test" } : {}),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "artworks.thetvdb.com" },
    ],
  },
};

export default nextConfig;
