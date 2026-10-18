/// <reference types="vitest/config" />
import { configDefaults } from "vitest/config";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build can be hosted under any folder.
  base: "./",
  server: {
    // The AI server (src/server/), started alongside Vite by `npm run dev`.
    proxy: { "/api": `http://127.0.0.1:${process.env.AI_PORT ?? 8787}` },
  },
  test: {
    // Session worktrees under .claude/ are full copies of the repo.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
