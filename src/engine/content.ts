// Loads every YAML file under content/ from disk. Shared by the content
// validator script and the tests; the browser bundles the files instead
// (src/app/content.ts). Parsing and schema checks live in parse.ts.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseContent, type ContentFile, type LoadResult } from "./parse.js";

export type { Content, ContentFile, LoadResult } from "./parse.js";

export const CONTENT_ROOT = fileURLToPath(new URL("../../content", import.meta.url));

function yamlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return yamlFiles(path);
    return e.name.endsWith(".yaml") ? [path] : [];
  });
}

export function loadContent(root: string = CONTENT_ROOT): LoadResult {
  const files: ContentFile[] = yamlFiles(root).map((file) => ({
    path: relative(root, file).split(sep).join("/"),
    text: readFileSync(file, "utf8"),
  }));
  return parseContent(files);
}
