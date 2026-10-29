/// <reference types="vitest/config" />
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { configDefaults } from "vitest/config";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The site's stylesheets, in the order php/head-loads.php and creator.php load them.
const SITE_CSS = ["bootstrap.min.css", "tokens.css", "portfolio-nested.css", "portfolio-media-queries.css", "rpg.css", "rpg-night.css"];
const TYPES: Record<string, string> = {
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
};

// In development the creator wears the Strange Frontiers site's real CSS,
// served as is from the portfolio_site repo beside this one, and linked ahead
// of the creator's own styles, as on creator.php. A build leaves it out: the
// site's page already loads it.
function siteCss(siteDir: string): Plugin {
  return {
    name: "site-css",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/@site", (req, res, next) => {
        const file = join(siteDir, decodeURIComponent((req.url ?? "").split("?")[0]!));
        if (!file.startsWith(siteDir + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    transformIndexHtml: () =>
      SITE_CSS.map((name) => ({ tag: "link", attrs: { rel: "stylesheet", href: `/@site/css/${name}` }, injectTo: "head-prepend" as const })),
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const dev = command === "serve";
  // SF_SITE_DIR in .env points at the site's repo if it isn't beside this one.
  const siteDir = resolve(env.SF_SITE_DIR || "../portfolio_site");
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
    // Game Tools' assistant always runs in the browser, through the local AI
    // server in development and the site's game-tools-api.php in a build.
    toolsEndpoint: env.VITE_SF_TOOLS_ENDPOINT || (dev ? "api/messages" : "game-tools-api.php"),
  };

  return {
    plugins: [react(), siteCss(siteDir)],
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
