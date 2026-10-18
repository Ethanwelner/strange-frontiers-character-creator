/// <reference types="vitest/config" />
import { configDefaults } from "vitest/config";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build can be hosted under any folder.
  base: "./",
  test: {
    // Session worktrees under .claude/ are full copies of the repo.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
