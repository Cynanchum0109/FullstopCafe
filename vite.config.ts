import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves this from /FullstopCafe/, not from the domain root, so
  // every asset URL needs the repository name in front of it. Left as "/" for
  // local dev, where the site is at the root.
  base: process.env["GITHUB_ACTIONS"] ? "/FullstopCafe/" : "/",
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: "es2022",
  },
});
