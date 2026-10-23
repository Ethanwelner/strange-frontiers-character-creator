/// <reference types="vitest/config" />
import { configDefaults } from "vitest/config";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const dev = command === "serve";
  // How Build it reaches a model, read in src/app/components/DescribeBox.tsx.
  // Claude runs the loop in the browser and sends each turn to `endpoint`:
  // the local AI server in development, the website's PHP proxy
  // (creator-api.php) in a build, which always uses Claude. In development,
  // Ollama (the AI server's default, unless SF_PROVIDER=anthropic) asks the
  // local AI server for the whole build instead.
  const ai = {
    route: dev && env.SF_PROVIDER?.trim().toLowerCase() !== "anthropic" ? "server" : "browser",
    endpoint: env.VITE_SF_ENDPOINT || (dev ? "api/messages" : "creator-api.php"),
    model: (dev ? env.ANTHROPIC_MODEL?.trim() : env.VITE_SF_MODEL?.trim()) || "claude-haiku-5-5",
  };

  return {
    plugins: [react()],
    define: { __SF_AI__: JSON.stringify(ai) },
    // Relative asset paths, so the build can be hosted under any folder.
    base: "./",
    server: {
      // The AI server (src/server/), started alongside Vite by `npm run dev`.
      proxy: { "/api": `http://127.0.0.1:${process.env.AI_PORT ?? 8787}` },
    },
    test: {
      // Session worktrees under .claude/ are full copies of the repo.
      exclude: [...configDefaults.exclude, ".claude/**"],
      // The cached transform of src/app/content.ts doesn't notice new files in
      // content/, so the bundled-content test would see stale content.
      fsModuleCache: false,
    },
  };
});
