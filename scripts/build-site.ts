// Builds the creator and Game Tools into the Strange Frontiers site's
// creator/ folder, where creator.php and game-tools.php serve them. Only the script, the stylesheet and Vite's manifest
// go there: the pages read the hashed names from .vite/manifest.json, so
// there's no standalone index.html for anyone to open by mistake. Commit the
// result in the site's repo; the site's deploy publishes it.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { build, loadEnv } from "vite";

const env = loadEnv("production", process.cwd(), "");
const site = resolve(env.SF_SITE_DIR || "../portfolio_site");
if (!existsSync(join(site, "creator.php"))) {
  console.error(`No creator.php in ${site}. Check out portfolio_site beside this repo, or set SF_SITE_DIR in .env.`);
  process.exit(1);
}

const outDir = join(site, "creator");
await build({
  build: {
    outDir,
    emptyOutDir: true,
    manifest: true,
    rolldownOptions: { input: ["src/app/main.tsx", "src/tools/main.tsx"] },
  },
});
console.log(`Built the creator and Game Tools into ${outDir}. Commit it in the site's repo to publish it.`);
