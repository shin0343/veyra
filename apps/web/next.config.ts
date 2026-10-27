import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // Lets a dev server run beside the production demo build without sharing output.
  distDir: process.env.VEYRA_DIST_DIR || ".next",
  // Search became the Explore workspace; old links (Muse, ⌘K, bookmarks) keep their ?q=.
  async redirects() {
    return [{ source: "/search", destination: "/explore", permanent: false }];
  },
};
export default config;
